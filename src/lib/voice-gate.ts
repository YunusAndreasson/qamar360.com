/**
 * Deciding where one spoken sentence ends and the next begins.
 *
 * The library we transcribe with has no voice-activity detector — `react-native-sherpa-onnx`
 * ships Silero VAD inside its binary but exposes no way to reach it, and its `/vad` module is a
 * placeholder that throws. It also can't stream the model we use, and `transcribeSamples` takes a
 * plain `number[]`, so handing it a whole five-minute recording would mean marshalling 4.8 million
 * elements across the bridge in one go.
 *
 * All three problems have the same answer: **cut the stream into utterances here, and decode them
 * one at a time.** A segment is a few seconds long, so the array is small, the decode is quick, and
 * the sentence can land on screen while the user is still speaking the next one. What began as a
 * workaround is the better feature — a note that writes itself a sentence at a time as you pause.
 *
 * The gate itself is ported from open-arabic's `lib/voice/recording.ts`, where it has been wrong
 * twice in production and fixed twice against real recordings. Its structure is kept exactly; only
 * the timings are re-tuned, because that one is deciding when a learner has finished saying a
 * single word and this one is deciding when someone has finished a sentence.
 *
 * Pure, and tested against synthetic RMS traces — a microphone is not something jest can hold.
 */

/** What the recogniser wants: 16 kHz mono. `createPcmLiveStream` resamples to this natively. */
export const TARGET_SAMPLE_RATE = 16000;

/**
 * Absolute backstops under the otherwise-relative thresholds (the live one is
 * `noiseFloor × speechFactor`). open-arabic's values, and its warning with them: they were once
 * lowered to catch very soft speakers, which dropped the silence floor so far that trailing room
 * tone stopped counting as silence — segments then ran to the hard cap while the speaker repeated
 * themselves into a microphone that appeared dead. Raise `speechFactor` or the capture gain before
 * touching these again.
 */
const ABS_SPEECH_FLOOR = 0.003;
const ABS_SILENCE_FLOOR = 0.0018;
const INITIAL_NOISE_FLOOR = 0.005;

/** Audio kept either side of the detected speech. Enough that a soft onset or a trailing consonant
 *  is never clipped, short enough that the recogniser isn't handed seconds of room tone. */
const TRIM_PREROLL_MS = 200;
const TRIM_POSTROLL_MS = 250;

export interface GateConfig {
  speechFactor: number;
  silenceFactor: number;
  noiseRiseRate: number;
  /** Quiet for this long, and the sentence is over. */
  pauseHangMs: number;
  /** The backstop for the band *between* the two thresholds. Speech ends at `silenceThreshold` but
   *  restarts at the higher `speechThreshold`; audio parked in between is neither, so `silenceMs`
   *  stops accumulating and the segment could only ever end at the hard cap. Room tone landing in
   *  that band is what pinned real sessions to the cap in open-arabic. Necessarily ≥ `pauseHangMs`,
   *  so a genuinely quiet room still decides first. */
  idleHangMs: number;
  /** Below this, it isn't a sentence — it's a cough, a chair, a door. */
  minSegmentMs: number;
  /** The hard split, for someone who does not pause. */
  maxSegmentMs: number;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  speechFactor: 1.5,
  silenceFactor: 1.2,
  noiseRiseRate: 0.01,
  // 900 ms is the whole feel of this feature, and it is a genuine trade.
  //
  // Shorter and the text keeps up with you, but the gate starts cutting inside sentences — and a
  // fragment handed to a model that punctuates comes back punctuated, so "I prayed Fajr on time"
  // splits into "I prayed Fajr." / "On time." Longer and every sentence reads cleanly but the
  // screen lags a beat behind the voice, which reads as the app not listening.
  //
  // A second is also roughly where a pause stops being a comma and starts being a full stop, so
  // this lands on the boundary the speaker is already feeling. Same value open-arabic settled on.
  pauseHangMs: 900,
  idleHangMs: 1350,
  minSegmentMs: 400,
  // 20 s bounds two things at once: the bridge array (320k samples) and how long the screen can sit
  // still while someone talks without drawing breath. Moonshine takes variable-length audio, so
  // this is a latency ceiling rather than a model limit.
  maxSegmentMs: 20000,
};

/** The longest a single note may be recorded for in one sitting. Not a technical limit — the
 *  recogniser and the gate would both keep going. Ten minutes is where a diary entry stops being
 *  one, and where an accidental pocket-recording stops being cheap. */
export const MAX_NOTE_MS = 10 * 60 * 1000;

/** Why a segment closed. Both are ordinary; neither is an error. */
export type SegmentClose = 'pause' | 'maxSegment';

/** Mutable state the gate carries between buffers. */
export interface GateState {
  noiseFloor: number;
  /** Has this segment heard any speech yet? Silence before the first word is not a pause. */
  speechSeen: boolean;
  /** ms below `silenceThreshold` since speech was last heard. */
  silenceMs: number;
  /** ms below `speechThreshold` since speech was last heard. Always ≥ `silenceMs`, and the one
   *  that survives a raised noise floor. */
  idleMs: number;
  /** ms of audio in the current segment. */
  segmentMs: number;
}

/** A fresh segment. `noiseFloor` is carried across segments — the room does not change between
 *  sentences, and re-learning it every time would spend the first sentence of each one adapting. */
export function initialGateState(noiseFloor = INITIAL_NOISE_FLOOR): GateState {
  return { noiseFloor, speechSeen: false, silenceMs: 0, idleMs: 0, segmentMs: 0 };
}

/**
 * One buffer's worth of decision.
 *
 * Returns the next state, whether this buffer counted as speech (which is what bounds the region
 * actually sent to the recogniser — see {@link trimToSpeech}), and a close reason if the segment
 * has ended.
 *
 * A segment that has heard no speech at all never closes: silence before the first word is just
 * someone deciding what to say, and cutting there would spend a decode on room tone.
 */
export function stepGate(
  state: GateState,
  sample: { rms: number; bufferMs: number },
  config: GateConfig = DEFAULT_GATE_CONFIG,
): { state: GateState; isSpeech: boolean; close: SegmentClose | null } {
  const { rms, bufferMs } = sample;
  const speechThreshold = Math.max(ABS_SPEECH_FLOOR, state.noiseFloor * config.speechFactor);
  const silenceThreshold = Math.max(ABS_SILENCE_FLOOR, state.noiseFloor * config.silenceFactor);

  let { noiseFloor, speechSeen, silenceMs, idleMs, segmentMs } = state;

  // The floor tracks down instantly and up slowly: a room that goes quiet is quiet now, but a room
  // that gets loud might just be someone talking.
  if (rms < noiseFloor) noiseFloor = rms;
  else if (rms < speechThreshold) noiseFloor += (rms - noiseFloor) * config.noiseRiseRate;

  const isSpeech = rms >= speechThreshold;
  if (isSpeech) {
    speechSeen = true;
    silenceMs = 0;
    idleMs = 0;
  } else if (speechSeen) {
    // Below the speech threshold always counts as idle; only genuinely quiet audio counts as
    // silence. Tracking both is what stops the band between them being a state with no exit.
    idleMs += bufferMs;
    if (rms < silenceThreshold) silenceMs += bufferMs;
  }
  // Time only accrues once there is something to time. Leading silence is not part of the segment.
  if (speechSeen) segmentMs += bufferMs;

  const next = { noiseFloor, speechSeen, silenceMs, idleMs, segmentMs };
  if (!speechSeen) return { state: next, isSpeech, close: null };

  const pastMinimum = segmentMs >= config.minSegmentMs;
  if (pastMinimum && (silenceMs >= config.pauseHangMs || idleMs >= config.idleHangMs)) {
    return { state: next, isSpeech, close: 'pause' };
  }
  if (segmentMs >= config.maxSegmentMs) return { state: next, isSpeech, close: 'maxSegment' };
  return { state: next, isSpeech, close: null };
}

/** Root-mean-square of a buffer — the loudness number the gate and the on-screen meter both read.
 *  Indexed rather than reduced: this runs on every buffer, ten times a second, forever. */
export function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * Narrow a segment to the part that was actually spoken.
 *
 * The captured buffer runs from wherever the last segment ended to the moment the gate called time,
 * so it carries a pause at the front and the full `pauseHangMs` hang at the back. Both ends cost
 * twice: every sample is converted to a JS number before an offline model decodes it, and decode
 * time scales with length.
 *
 * Returns the input untouched when no speech was located, so nothing is ever silently dropped.
 */
export function trimToSpeech(
  input: Float32Array,
  range: { firstSpeechSample: number | null; lastSpeechSample: number | null },
  sampleRate = TARGET_SAMPLE_RATE,
): Float32Array {
  const { firstSpeechSample, lastSpeechSample } = range;
  if (firstSpeechSample === null || lastSpeechSample === null) return input;
  if (lastSpeechSample <= firstSpeechSample) return input;
  const start = Math.max(0, firstSpeechSample - Math.round((TRIM_PREROLL_MS * sampleRate) / 1000));
  const end = Math.min(input.length, lastSpeechSample + Math.round((TRIM_POSTROLL_MS * sampleRate) / 1000));
  if (start >= end || (start === 0 && end === input.length)) return input;
  return input.subarray(start, end);
}

/**
 * Gently peak-normalise before decoding. A no-op when the segment is already loud enough or is
 * pure silence; the gain is capped so a faint recording isn't amplified into noise.
 *
 * This is why the absolute floors above can stay high: a quiet speaker is fixed here, after the
 * gate has already decided where the words are, rather than by lowering the threshold that decides.
 */
export function normalizeGain(input: Float32Array, target = 0.7, maxGain = 60): Float32Array {
  let peak = 0;
  for (let i = 0; i < input.length; i += 1) {
    const a = Math.abs(input[i] ?? 0);
    if (a > peak) peak = a;
  }
  if (peak < 1e-3 || peak >= target) return input;
  const gain = Math.min(target / peak, maxGain);
  if (gain <= 1) return input;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = (input[i] ?? 0) * gain;
  return out;
}

/**
 * `Float32Array` → the `number[]` the native bridge insists on.
 *
 * Pre-sized and indexed rather than `Array.from`, because this sits inside the wait the user is
 * watching — open-arabic hand-rolled the same loop for the same reason.
 */
export function toSampleArray(samples: Float32Array): number[] {
  const out = new Array<number>(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] ?? 0;
  return out;
}

/**
 * How full the on-screen meter should be for this buffer, 0–1.
 *
 * `sqrt` because RMS is a power measure and the eye reads amplitude — without it a normal speaking
 * voice sits in the bottom fifth of the meter and the whole thing looks broken. The reference level
 * adapts to the loudest recent buffer and decays, so the meter uses its full height in a quiet
 * room and doesn't peg in a loud one.
 */
export function meterLevel(rms: number, reference: number): number {
  return Math.max(0, Math.min(1, Math.sqrt(rms / Math.max(reference, 0.02))));
}

/** Peak decay for the meter's reference level, per buffer. Slow enough that a loud sentence doesn't
 *  flatten the one after it, fast enough to recover within a few seconds of a cough. */
export const METER_PEAK_DECAY = 0.985;
