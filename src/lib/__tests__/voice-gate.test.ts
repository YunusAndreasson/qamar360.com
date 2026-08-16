import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_GATE_CONFIG,
  initialGateState,
  meterLevel,
  normalizeGain,
  rmsOf,
  stepGate,
  toSampleArray,
  trimToSpeech,
  type GateState,
  type SegmentClose,
} from '@/lib/voice-gate';

const BUFFER_MS = 100; // what `createPcmLiveStream` delivers at 1600 frames / 16 kHz

const SPEECH = 0.2; // an ordinary speaking voice, well over the absolute floor
const ROOM = 0.0005; // a quiet bedroom, under ABS_SILENCE_FLOOR
/** Loud enough not to be silence, quiet enough not to be speech — the band that once trapped the
 *  gate in a state it could not leave. `idleHangMs` is the only thing that gets it out. */
const BETWEEN = 0.004;

/** Run a trace of RMS values through the gate, returning where each segment closed and why. */
function run(levels: number[], state: GateState = initialGateState()) {
  const closes: { at: number; reason: SegmentClose }[] = [];
  let current = state;
  levels.forEach((rms, i) => {
    const step = stepGate(current, { rms, bufferMs: BUFFER_MS }, DEFAULT_GATE_CONFIG);
    current = step.state;
    if (step.close) {
      closes.push({ at: i, reason: step.close });
      current = initialGateState(step.state.noiseFloor);
    }
  });
  return { closes, state: current };
}

/** `n` buffers at one level. */
const hold = (level: number, n: number) => Array.from({ length: n }, () => level);

describe('stepGate', () => {
  it('does not close on silence before anything has been said', () => {
    // Thirty seconds of someone deciding what to say is not a sentence, and must not cost a decode.
    expect(run(hold(ROOM, 300)).closes).toEqual([]);
  });

  it('closes a sentence once the speaker pauses', () => {
    const { closes } = run([...hold(SPEECH, 20), ...hold(ROOM, 20)]);
    expect(closes).toHaveLength(1);
    expect(closes[0]!.reason).toBe('pause');
    // 900 ms of quiet after the last word — nine buffers, not the twenty that followed.
    expect(closes[0]!.at).toBe(20 + DEFAULT_GATE_CONFIG.pauseHangMs / BUFFER_MS - 1);
  });

  // The whole reason to hold a pause open for the best part of a second.
  it('does not cut at the short pause inside a sentence', () => {
    const commaPause = hold(ROOM, 4); // 400 ms — a breath, not a full stop
    expect(run([...hold(SPEECH, 10), ...commaPause, ...hold(SPEECH, 10)]).closes).toEqual([]);
  });

  it('splits someone who never pauses, at the cap', () => {
    const { closes } = run(hold(SPEECH, 300));
    expect(closes[0]).toEqual({ at: DEFAULT_GATE_CONFIG.maxSegmentMs / BUFFER_MS - 1, reason: 'maxSegment' });
  });

  it('keeps segmenting sentence after sentence', () => {
    const sentence = [...hold(SPEECH, 10), ...hold(ROOM, 12)];
    expect(run([...sentence, ...sentence, ...sentence]).closes.map((c) => c.reason)).toEqual([
      'pause',
      'pause',
      'pause',
    ]);
  });

  // The bug this gate has actually had, twice, in production: room tone parked between the two
  // thresholds stops `silenceMs` accumulating, so without `idleHangMs` the segment could only ever
  // end at the hard cap — while the speaker repeats themselves into an apparently dead microphone.
  it('escapes the band between the thresholds', () => {
    const { closes } = run([...hold(SPEECH, 10), ...hold(BETWEEN, 40)]);
    expect(closes).toHaveLength(1);
    expect(closes[0]!.reason).toBe('pause');
    expect(closes[0]!.at).toBeLessThan(10 + DEFAULT_GATE_CONFIG.maxSegmentMs / BUFFER_MS);
  });

  it('ignores a cough too short to be a sentence', () => {
    // One loud buffer (100 ms) is under `minSegmentMs`, so the pause after it closes nothing until
    // the segment has enough length to be worth decoding.
    const { closes } = run([...hold(SPEECH, 1), ...hold(ROOM, 5)]);
    expect(closes).toEqual([]);
  });

  it('carries the learned noise floor into the next sentence', () => {
    const loudRoom = 0.01;
    const { state } = run([...hold(loudRoom, 50), ...hold(SPEECH, 10), ...hold(loudRoom, 20)]);
    // Learned down towards the room, not left at the optimistic initial guess.
    expect(state.noiseFloor).toBeLessThanOrEqual(loudRoom);
  });
});

describe('rmsOf', () => {
  it('is zero for silence and the amplitude of a constant signal', () => {
    expect(rmsOf(new Float32Array(64))).toBe(0);
    expect(rmsOf(new Float32Array(64).fill(0.5))).toBeCloseTo(0.5);
  });

  it('is zero for an empty buffer rather than NaN', () => {
    expect(rmsOf(new Float32Array(0))).toBe(0);
  });
});

describe('trimToSpeech', () => {
  const sampleRate = 16000;

  it('keeps a preroll and postroll around the speech', () => {
    const input = new Float32Array(sampleRate * 4); // 4 s
    const out = trimToSpeech(
      input,
      { firstSpeechSample: sampleRate * 2, lastSpeechSample: sampleRate * 3 },
      sampleRate,
    );
    // 1 s of speech + 200 ms before + 250 ms after.
    expect(out.length).toBe(Math.round(sampleRate * 1.45));
  });

  it('returns the buffer untouched when no speech was located', () => {
    const input = new Float32Array(100);
    expect(trimToSpeech(input, { firstSpeechSample: null, lastSpeechSample: null }, sampleRate)).toBe(input);
  });

  it('never trims past the ends of the buffer', () => {
    const input = new Float32Array(1000);
    const out = trimToSpeech(input, { firstSpeechSample: 0, lastSpeechSample: 999 }, sampleRate);
    expect(out.length).toBe(1000);
  });
});

describe('normalizeGain', () => {
  it('lifts a quiet segment towards the target', () => {
    const out = normalizeGain(new Float32Array(8).fill(0.07));
    expect(out[0]).toBeCloseTo(0.7, 5);
  });

  it('leaves a loud segment alone', () => {
    const loud = new Float32Array(8).fill(0.9);
    expect(normalizeGain(loud)).toBe(loud);
  });

  it('does not amplify silence into noise', () => {
    const silence = new Float32Array(8).fill(0.0001);
    expect(normalizeGain(silence)).toBe(silence);
  });

  it('caps the gain', () => {
    const veryQuiet = new Float32Array(8).fill(0.002);
    expect(normalizeGain(veryQuiet, 0.7, 10)[0]).toBeCloseTo(0.02, 5);
  });
});

describe('toSampleArray', () => {
  it('hands the bridge a plain array of the same values', () => {
    const out = toSampleArray(Float32Array.from([0, 0.5, -0.5]));
    expect(Array.isArray(out)).toBe(true);
    expect(out[1]).toBeCloseTo(0.5);
  });
});

describe('meterLevel', () => {
  it('puts an ordinary voice well up the meter rather than in the bottom fifth', () => {
    // The whole point of the square root: linear RMS/reference would read 0.2 here.
    expect(meterLevel(0.05, 0.25)).toBeCloseTo(0.447, 2);
  });

  it('stays inside 0–1 however loud it gets', () => {
    expect(meterLevel(10, 0.02)).toBe(1);
    expect(meterLevel(0, 0.5)).toBe(0);
  });
});
