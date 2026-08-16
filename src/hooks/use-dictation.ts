import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { createPcmLiveStream, type PcmLiveStreamHandle } from 'react-native-sherpa-onnx/audio';
import {
  ModelCategory,
  ensureModelByCategory,
  getLocalModelPathByCategory,
  isModelDownloadedByCategory,
  refreshModelsByCategory,
} from 'react-native-sherpa-onnx/download';
import { createSTT, detectSttModel, type STTModelType, type SttEngine } from 'react-native-sherpa-onnx/stt';

import { useLatestRef } from '@/hooks/use-latest-ref';
import { haptics } from '@/lib/haptics';
import {
  DEFAULT_GATE_CONFIG,
  MAX_NOTE_MS,
  METER_PEAK_DECAY,
  TARGET_SAMPLE_RATE,
  initialGateState,
  meterLevel,
  normalizeGain,
  rmsOf,
  stepGate,
  toSampleArray,
  trimToSpeech,
  type GateState,
} from '@/lib/voice-gate';

/**
 * Writing a note down, on the phone, with nothing leaving it.
 *
 * The audio is captured as raw PCM, cut into sentences by {@link stepGate}, decoded one sentence at
 * a time, and dropped. It is never written to a file, never uploaded, and never held beyond the
 * sentence being decoded — so "the recording is deleted afterwards" isn't a step this code performs,
 * it is a thing that has no opportunity to happen.
 *
 * ## Why a sentence at a time
 *
 * `react-native-sherpa-onnx@0.4.3` gives us three constraints and they all point the same way. Its
 * VAD module is a placeholder that throws (Silero is compiled into the binary but unbound). Its
 * streaming recogniser accepts only transducer/CTC families, and the model we want is not one. And
 * `transcribeSamples` takes a plain `number[]`, so a five-minute take would mean marshalling 4.8
 * million elements across the bridge in a single call.
 *
 * Cutting the stream into utterances answers all three: the arrays stay small, the decode stays
 * quick, and the sentence can land on screen while the next one is still being spoken. What began
 * as a workaround is the better feature.
 *
 * ## The decode queue
 *
 * Decoding never runs on the capture path. A segment closes, it goes on a queue, and a single
 * drainer works through it — so a slow phone falls *behind* rather than dropping audio, and the
 * user sees it catching up rather than losing words. {@link DictationState.pending} is that
 * backlog, and `stop()` does not resolve until it is empty.
 */

/**
 * The model, named once.
 *
 * Moonshine base-en, quantised (Feb 2026) — 106 MB. Chosen over the alternatives in sherpa-onnx's
 * `asr-models` release for three reasons: it is trained on text with standardised punctuation and
 * capitalisation so it emits both natively (the library exposes no punctuation model, so a model
 * that can't punctuate itself can't be fixed); it takes variable-length audio rather than padding
 * every clip to 30 s like Whisper, which is exactly the shape of a segment queue; and it is the
 * only thing near this size in that quality class — Parakeet TDT 0.6B punctuates too but wants
 * 1.2 GB of RAM on iOS.
 *
 * `sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8` (146 MB, `modelType: 'canary'`,
 * `usePnc: true`) is the credible A/B. Swap this constant and re-run the same five recordings.
 */
export const VOICE_MODEL_ID = 'sherpa-onnx-moonshine-base-en-quantized-2026-02-27';

/**
 * Two different costs, and the honest thing is to quote each where it lands.
 *
 * `VOICE_MODEL_MB` is the compressed tarball — the bandwidth, which is what the gate asks
 * permission to spend. `VOICE_MODEL_DISK_MB` is what it unpacks to (a 31 MB encoder and a 109 MB
 * merged decoder), which is what Settings is accounting for when it offers to free it. Measured on
 * device, not estimated.
 */
export const VOICE_MODEL_MB = 106;
export const VOICE_MODEL_DISK_MB = 141;

/** Half a second of silence, decoded once before we claim to be ready.
 *
 *  The first `transcribeSamples` call builds the ONNX graph: open-arabic measured 2949 ms for it
 *  against ~1150 ms for every call after. Without this the user's *first* sentence — the one they
 *  have been composing in their head — is the one that hangs. */
const WARMUP_SAMPLES = TARGET_SAMPLE_RATE / 2;

/** 100 ms per buffer at 16 kHz: fine enough for the gate, coarse enough not to flood the bridge. */
const BUFFER_FRAMES = 1600;

/** A segment can be `maxSegmentMs` long, so the capture buffer is sized for the worst case once and
 *  reused. 20 s of 16 kHz mono floats is 1.28 MB — the entire memory footprint of the audio. */
const SEGMENT_CAPACITY = Math.ceil((DEFAULT_GATE_CONFIG.maxSegmentMs / 1000) * TARGET_SAMPLE_RATE);

/** How much audio to carry forward from before the first word — enough that a soft onset is never
 *  clipped, bounded so a long silence can't fill the capture buffer while nobody is speaking. */
const PREROLL_SAMPLES = Math.round(0.3 * TARGET_SAMPLE_RATE);

/**
 * How long a started stream may deliver nothing before we call it dead.
 *
 * This is also the microphone-permission check we don't otherwise have. iOS raises its own prompt
 * when capture starts and never re-prompts once denied; rather than add a dependency to read that
 * state, a stream that produces no audio at all is treated as "the microphone isn't reaching us",
 * which is the same message either cause deserves.
 *
 * Generous on purpose. open-arabic can afford 700 ms because it holds one session open for the
 * whole review and only resumes it; ours negotiates a fresh input device every time, which on a
 * cold Android can take seconds. Timing out early would accuse a working microphone of being
 * broken, and the only cost of waiting is that a genuinely broken one says so a little later.
 */
const FIRST_BUFFER_TIMEOUT_MS = 3000;

/** Reached from outside as `DictationState['status']`, so the union itself stays private. */
type DictationStatus =
  /** Nothing prepared yet. */
  | 'idle'
  /** Looking for the model on disk. */
  | 'checking'
  /** It isn't there. The sheet asks before spending 106 MB of someone's data. */
  | 'needsDownload'
  | 'downloading'
  /** Loading and warming the recogniser. */
  | 'preparing'
  /** Warm, waiting for the tap. */
  | 'ready'
  /** The stream is open but no audio has arrived yet. Saying "Listening…" here is what eats the
   *  user's first words, so it is a state of its own — open-arabic's hardest-won lesson. */
  | 'arming'
  | 'listening'
  /** Stopped; the queue is still draining. */
  | 'finishing'
  | 'error';

export type DictationState = {
  status: DictationStatus;
  /** 0–100 while downloading, with the phase, so "extracting" doesn't look like a stall at 100%. */
  progress: { percent: number; phase: 'downloading' | 'extracting' } | null;
  /** Plain-language failure, or null. */
  error: string | null;
  /** Segments decoded but not yet returned — the visible backlog. */
  pending: number;
  /** Seconds of audio captured this sitting. */
  elapsed: number;
  /** Meter fill, 0–1, written straight from the audio callback. Read it on the UI thread through
   *  an animated style: it updates ten times a second and must cost zero React renders. */
  level: SharedValue<number>;
};

const NO_MODEL = 'Couldn’t load the voice model. You can still type your note.';
const NO_MIC = 'Qamar can’t hear the microphone. Check its permission in Settings — or type instead.';
const NO_DOWNLOAD = 'Couldn’t finish the download. Check your connection and try again.';

/** Android needs `RECORD_AUDIO` asked for explicitly; iOS raises its own prompt when capture starts
 *  (and, once denied, never again — which {@link FIRST_BUFFER_TIMEOUT_MS} is what catches). */
async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Resolve the model's directory, downloading it if asked to.
 *
 * The stale-registry retry is open-arabic's, and it is not optional: the model list is a cached
 * read of a GitHub release, and a cold or expired cache makes a perfectly valid id come back as
 * "unknown model id". Refresh once and try again before believing it.
 */
async function resolveModelPath(
  allowDownload: boolean,
  onProgress: (progress: DictationState['progress']) => void,
): Promise<string | null> {
  if (!allowDownload) {
    const have = await isModelDownloadedByCategory(ModelCategory.Stt, VOICE_MODEL_ID);
    return have ? await getLocalModelPathByCategory(ModelCategory.Stt, VOICE_MODEL_ID) : null;
  }
  const download = () =>
    ensureModelByCategory(ModelCategory.Stt, VOICE_MODEL_ID, {
      onProgress: (p) => onProgress({ percent: p.percent, phase: p.phase ?? 'downloading' }),
    });
  try {
    return (await download()).localPath;
  } catch (err) {
    if (!/unknown model id/i.test(String(err))) throw err;
    await refreshModelsByCategory(ModelCategory.Stt, { forceRefresh: true });
    return (await download()).localPath;
  }
}

/** Load the recogniser and decode half a second of nothing, so the first real sentence doesn't
 *  pay for the graph build. */
async function openEngine(modelPath: string): Promise<SttEngine> {
  // Ask native what it found rather than asserting a type. The 2026 Moonshine builds may be the v2
  // architecture, whose `moonshine_v2` type the native layer accepts but the TS union omits — and
  // detection reads the model directory itself, so it is right either way.
  const detected = await detectSttModel({ type: 'file', path: modelPath }, { preferInt8: true });
  const engine = await createSTT({
    modelPath: { type: 'file', path: modelPath },
    modelType: (detected.modelType as STTModelType | undefined) ?? 'auto',
    preferInt8: true,
    // Two, as open-arabic runs it. More threads stop helping on a phone's efficiency cores and
    // start competing with the UI thread this is trying to keep smooth.
    numThreads: 2,
  });
  await engine.transcribeSamples(new Array<number>(WARMUP_SAMPLES).fill(0), TARGET_SAMPLE_RATE);
  return engine;
}

/**
 * @param onSentence Called with each decoded sentence, in order, as it becomes available. Given the
 * raw recogniser text — the vocabulary pass belongs to the caller, which is the only place that
 * knows the user's own habit names.
 */
export function useDictation(onSentence: (text: string) => void): DictationState & {
  /** Load the model if it is already on disk; report `needsDownload` if it isn't. */
  prepare: () => Promise<void>;
  /** Spend the 106 MB, then prepare. */
  download: () => Promise<void>;
  /** Leave the `error` state: reload the model, or simply stand down if only the microphone failed. */
  retry: () => Promise<void>;
  start: () => Promise<void>;
  /** Stops capture and resolves once every queued segment has been decoded. */
  stop: () => Promise<void>;
} {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [progress, setProgress] = useState<DictationState['progress']>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const level = useSharedValue(0);

  const engine = useRef<SttEngine | null>(null);
  const stream = useRef<PcmLiveStreamHandle | null>(null);
  const unsubscribe = useRef<(() => void)[]>([]);
  // Mirrored rather than closed over, so the drainer never calls a stale handler after a re-render
  // — and mirrored through `useLatestRef` (which writes in an effect) rather than by assigning
  // during render, which React 19 rightly refuses.
  const onSentenceRef = useLatestRef(onSentence);

  // The capture buffer, allocated once and rewound per segment.
  const buffer = useRef(new Float32Array(SEGMENT_CAPACITY));
  const written = useRef(0);
  const firstSpeech = useRef<number | null>(null);
  const lastSpeech = useRef<number | null>(null);
  const gate = useRef<GateState>(initialGateState());
  const meterReference = useRef(0.02);
  const capturedMs = useRef(0);
  const sawFirstBuffer = useRef(false);

  const queue = useRef<number[][]>([]);
  const draining = useRef(false);
  const capturing = useRef(false);
  // The sheet can close while the model is still loading. Without this the engine finishes opening
  // into a component that no longer exists, and a few hundred megabytes of ONNX graph is held for
  // the life of the process with nothing left to destroy it.
  const disposed = useRef(false);
  // `prepare()` fires on mount and `download()` from a tap — both must not open a recogniser.
  const preparing = useRef(false);

  /** Work through the backlog one segment at a time. Serial on purpose: two concurrent
   *  `transcribeSamples` calls would contend for the same native recogniser and would also let
   *  sentences finish out of order, which in a diary means shuffled words. */
  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length > 0) {
        const samples = queue.current.shift()!;
        const engineNow = engine.current;
        if (!engineNow) break;
        try {
          const result = await engineNow.transcribeSamples(samples, TARGET_SAMPLE_RATE);
          const text = result.text.trim();
          if (text) onSentenceRef.current(text);
        } catch {
          // One segment failing is a lost sentence, not a lost note — keep draining the rest
          // rather than throwing away everything still queued behind it.
        }
        setPending(queue.current.length);
      }
    } finally {
      draining.current = false;
    }
  }, [onSentenceRef]);

  /** Close the segment held in the buffer and hand it to the queue. */
  const flushSegment = useCallback(() => {
    const length = written.current;
    written.current = 0;
    const bounds = { firstSpeechSample: firstSpeech.current, lastSpeechSample: lastSpeech.current };
    firstSpeech.current = null;
    lastSpeech.current = null;
    gate.current = initialGateState(gate.current.noiseFloor);
    if (length === 0 || bounds.firstSpeechSample === null) return;

    const spoken = trimToSpeech(buffer.current.subarray(0, length), bounds);
    // `toSampleArray` is what copies the audio out of the reused buffer — do it here, before the
    // next buffer overwrites it, and never hand a subarray view to the queue.
    queue.current.push(toSampleArray(normalizeGain(spoken)));
    setPending(queue.current.length);
    void drain();
  }, [drain]);

  const handleBuffer = useCallback(
    (samples: Float32Array) => {
      if (!capturing.current) return;
      if (!sawFirstBuffer.current) {
        sawFirstBuffer.current = true;
        setStatus('listening');
        // The "go" — so nobody has to be watching the screen to know the microphone is live.
        haptics.pickup();
      }

      const rms = rmsOf(samples);
      // The meter's reference is the loudest recent buffer, decayed — so it fills the bar in a
      // quiet room and doesn't peg in a loud one. Written to a shared value, not to state: this
      // runs ten times a second and must not cost a render.
      meterReference.current = Math.max(rms, meterReference.current * METER_PEAK_DECAY, 0.02);
      level.set(meterLevel(rms, meterReference.current));

      const bufferMs = (samples.length / TARGET_SAMPLE_RATE) * 1000;
      capturedMs.current += bufferMs;
      // Whether we were still waiting for the first word *before* this buffer — `stepGate` is
      // about to flip `speechSeen`, and the answer decides whether this audio is a preroll or a
      // sentence.
      const awaitingFirstWord = !gate.current.speechSeen;
      const step = stepGate(gate.current, { rms, bufferMs }, DEFAULT_GATE_CONFIG);
      gate.current = step.state;

      // Silence before the first word is not part of the segment — the gate refuses to time it, so
      // it must not be stored either. Without this, someone who taps record and then thinks for
      // twenty seconds fills the whole capture buffer with room tone, and the words they finally
      // say have nowhere left to go. Keep a short rolling preroll and drop the rest.
      if (awaitingFirstWord && !step.isSpeech && written.current + samples.length > PREROLL_SAMPLES) {
        const keep = Math.max(0, PREROLL_SAMPLES - samples.length);
        buffer.current.copyWithin(0, written.current - keep, written.current);
        written.current = keep;
      }

      const start = written.current;
      const room = Math.min(samples.length, buffer.current.length - start);
      if (room > 0) {
        buffer.current.set(samples.subarray(0, room), start);
        written.current = start + room;
        if (step.isSpeech) {
          if (firstSpeech.current === null) firstSpeech.current = start;
          lastSpeech.current = written.current;
        }
      }

      if (step.close) flushSegment();
    },
    [flushSegment, level],
  );

  const teardownStream = useCallback(async () => {
    capturing.current = false;
    for (const off of unsubscribe.current) off();
    unsubscribe.current = [];
    const current = stream.current;
    stream.current = null;
    level.set(0);
    if (current) await current.stop().catch(() => undefined);
  }, [level]);

  const prepareWith = useCallback(
    async (allowDownload: boolean) => {
      if (engine.current || preparing.current) return;
      preparing.current = true;
      setError(null);
      setStatus(allowDownload ? 'downloading' : 'checking');
      try {
        const modelPath = await resolveModelPath(allowDownload, setProgress);
        if (!modelPath) {
          setStatus('needsDownload');
          return;
        }
        setProgress(null);
        setStatus('preparing');
        const opened = await openEngine(modelPath);
        if (disposed.current) {
          void opened.destroy().catch(() => undefined);
          return;
        }
        engine.current = opened;
        setStatus('ready');
      } catch {
        setProgress(null);
        setError(allowDownload ? NO_DOWNLOAD : NO_MODEL);
        setStatus('error');
      } finally {
        preparing.current = false;
      }
    },
    [],
  );

  const prepare = useCallback(() => prepareWith(false), [prepareWith]);
  const download = useCallback(() => prepareWith(true), [prepareWith]);

  /**
   * Leave the `error` state — the one thing it could not do for itself.
   *
   * `prepare()` runs once, from a mount effect, so a failure here used to be terminal for as long
   * as the screen stayed open: the only way back to a working microphone was to close the note and
   * open it again. Two different failures land in the same state and want opposite repairs.
   *
   * A **microphone** failure leaves the recogniser loaded and perfectly well, so there is nothing
   * to prepare — dropping back to `ready` is the whole fix, and whether the permission has since
   * been granted is not knowable from here anyway. The next tap finds out, which is what the tap
   * did the first time.
   *
   * A **model** failure has no engine, so it goes back through `prepareWith(false)`. Deliberately
   * without the download: if the model isn't on disk this lands on `needsDownload` and asks again,
   * rather than quietly re-spending 106 MB of somebody's data on their behalf.
   */
  const retry = useCallback(async () => {
    if (engine.current) {
      setError(null);
      setStatus('ready');
      return;
    }
    await prepareWith(false);
  }, [prepareWith]);

  const start = useCallback(async () => {
    if (!engine.current || capturing.current) return;
    if (!(await ensureMicPermission())) {
      setError(NO_MIC);
      setStatus('error');
      return;
    }
    setError(null);
    setStatus('arming');
    capturing.current = true;
    sawFirstBuffer.current = false;
    capturedMs.current = 0;
    written.current = 0;
    firstSpeech.current = null;
    lastSpeech.current = null;
    gate.current = initialGateState();
    meterReference.current = 0.02;
    setElapsed(0);

    try {
      const handle = createPcmLiveStream({
        sampleRate: TARGET_SAMPLE_RATE,
        channelCount: 1,
        bufferSizeFrames: BUFFER_FRAMES,
      });
      stream.current = handle;
      unsubscribe.current = [
        handle.onData(handleBuffer),
        handle.onError(() => {
          setError(NO_MIC);
          setStatus('error');
          void teardownStream();
        }),
      ];
      await handle.start();
    } catch {
      capturing.current = false;
      setError(NO_MIC);
      setStatus('error');
    }
  }, [handleBuffer, teardownStream]);

  const stop = useCallback(async () => {
    if (!capturing.current) return;
    setStatus('finishing');
    haptics.drop();
    await teardownStream();
    // Whatever is still in the buffer is a real sentence the user just finished; flush it before
    // waiting, or the last thing they said is the one thing that doesn't make it into the note.
    flushSegment();
    await drain();
    setStatus(engine.current ? 'ready' : 'idle');
  }, [drain, flushSegment, teardownStream]);

  // A dead stream — a denied microphone on iOS, a session another app is holding — otherwise
  // leaves the sheet sitting on "arming" forever, listening to nothing.
  useEffect(() => {
    if (status !== 'arming') return;
    const timer = setTimeout(() => {
      if (sawFirstBuffer.current) return;
      setError(NO_MIC);
      setStatus('error');
      void teardownStream();
    }, FIRST_BUFFER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, teardownStream]);

  // The elapsed counter, and the ten-minute ceiling. Driven off captured audio rather than
  // wall-clock, so a stream that stalls doesn't quietly run the clock out.
  useEffect(() => {
    if (status !== 'listening') return;
    const timer = setInterval(() => {
      setElapsed(Math.floor(capturedMs.current / 1000));
      if (capturedMs.current >= MAX_NOTE_MS) void stop();
    }, 1000);
    return () => clearInterval(timer);
  }, [status, stop]);

  // Free the recogniser with the editor. It is the largest allocation this app ever makes, and a
  // habit tracker has no business holding a few hundred megabytes of ONNX graph between notes.
  useEffect(
    () => () => {
      disposed.current = true;
      capturing.current = false;
      queue.current = [];
      void stream.current?.stop().catch(() => undefined);
      void engine.current?.destroy().catch(() => undefined);
      engine.current = null;
    },
    [],
  );

  return { status, progress, error, pending, elapsed, level, prepare, download, retry, start, stop };
}
