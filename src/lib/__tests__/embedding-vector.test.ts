import { describe, expect, it } from '@jest/globals';

import { decodeVector, encodeVector, similarity } from '@/lib/embedding-vector';

/** The model this feature loads returns 384 dimensions. Every length claim below is about that. */
const DIMS = 384;

/**
 * A deterministic unit vector. `jest` has no seeded RNG and `Math.random()` in a test is a flake
 * waiting to happen, so this is a plain LCG — the same numbers on every machine, forever.
 */
function seededUnitVector(seed: number, dims = DIMS): Float32Array {
  let state = seed >>> 0;
  const out = new Float32Array(dims);
  let sum = 0;
  for (let i = 0; i < dims; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const v = state / 0xffffffff - 0.5;
    out[i] = v;
    sum += v * v;
  }
  const norm = Math.sqrt(sum);
  for (let i = 0; i < dims; i += 1) out[i] = (out[i] ?? 0) / norm;
  return out;
}

/** Ranking by similarity, best first — the thing the whole encoding has to preserve. */
function topN(query: Float32Array, docs: Int8Array[], n: number): number[] {
  return docs
    .map((doc, i) => ({ i, score: similarity(doc, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((d) => d.i);
}

/** What the float32 answer would have been, for comparison against the quantised one. */
function floatDot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

describe('encoding', () => {
  it('is exactly 512 characters for 384 dimensions, with no padding', () => {
    // 384 is divisible by 3, so base64 comes out whole. This is what lets `decodeVector` treat a
    // single length comparison as the entire structural check, and what pins the storage cost.
    const encoded = encodeVector(seededUnitVector(1));
    expect(encoded).toHaveLength(512);
    expect(encoded).not.toContain('=');
  });

  it('cannot clip, because a normalised component cannot exceed 1', () => {
    // The strongest claim the module makes: quantisation needs no clamp *by construction*. A one-hot
    // vector is the extreme case — if anything overflowed a signed byte it would be this.
    const oneHot = new Float32Array(DIMS);
    oneHot[0] = 1;
    oneHot[1] = -1;

    const decoded = decodeVector(encodeVector(oneHot), DIMS);
    expect(decoded?.[0]).toBe(127);
    expect(decoded?.[1]).toBe(-127);
  });

  it('round-trips every component to within one quantisation step', () => {
    const vector = seededUnitVector(7);
    const decoded = decodeVector(encodeVector(vector), DIMS);
    expect(decoded).not.toBeNull();

    for (let i = 0; i < DIMS; i += 1) {
      expect(Math.abs((decoded?.[i] ?? 0) / 127 - (vector[i] ?? 0))).toBeLessThanOrEqual(1 / 254 + 1e-6);
    }
  });

  it('preserves negative components', () => {
    // The one thing a naive Uint8Array round-trip gets wrong, and half of every vector.
    const vector = seededUnitVector(3);
    const decoded = decodeVector(encodeVector(vector), DIMS);
    const negatives = [...(decoded ?? [])].filter((v) => v < 0);
    expect(negatives.length).toBeGreaterThan(DIMS / 4);
  });
});

describe('similarity', () => {
  it('scores a vector against itself at ~1', () => {
    const vector = seededUnitVector(11);
    const self = decodeVector(encodeVector(vector), DIMS);
    expect(similarity(self as Int8Array, vector)).toBeCloseTo(1, 2);
  });

  it('scores orthogonal vectors at ~0', () => {
    const a = new Float32Array(DIMS);
    const b = new Float32Array(DIMS);
    a[0] = 1;
    b[1] = 1;
    expect(similarity(decodeVector(encodeVector(a), DIMS) as Int8Array, b)).toBeCloseTo(0, 5);
  });

  it('moves a score by less than 0.01 over 100 seeded vectors', () => {
    // The measurement that justifies the whole encoding decision. If this ever fails, the storage
    // saving stopped being free and the table in the module header is a lie.
    const query = seededUnitVector(99);
    let worst = 0;

    for (let seed = 1; seed <= 100; seed += 1) {
      const doc = seededUnitVector(seed);
      const quantised = similarity(decodeVector(encodeVector(doc), DIMS) as Int8Array, query);
      worst = Math.max(worst, Math.abs(quantised - floatDot(doc, query)));
    }

    expect(worst).toBeLessThan(0.01);
  });

  it('picks the same top five as float32 would', () => {
    // Stronger, and the claim that actually matters: search shows a ranking, not a score. A drift
    // that never reorders anything is a drift nobody can see.
    const query = seededUnitVector(42);
    const docs: Float32Array[] = [];
    for (let seed = 200; seed < 250; seed += 1) docs.push(seededUnitVector(seed));

    const quantisedOrder = topN(query, docs.map((d) => decodeVector(encodeVector(d), DIMS) as Int8Array), 5);
    const floatOrder = docs
      .map((doc, i) => ({ i, score: floatDot(doc, query) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((d) => d.i);

    expect(quantisedOrder).toEqual(floatOrder);
  });
});

describe('decoding refuses junk rather than throwing', () => {
  // A corrupt blob has to degrade this feature to "no semantic search", never take the Journal down.
  const valid = encodeVector(seededUnitVector(5));

  it('rejects a truncated string', () => {
    expect(decodeVector(valid.slice(0, 500), DIMS)).toBeNull();
  });

  it('rejects a string that is too long', () => {
    expect(decodeVector(`${valid}AAAA`, DIMS)).toBeNull();
  });

  it('rejects a vector stored for a different number of dimensions', () => {
    expect(decodeVector(encodeVector(seededUnitVector(5, 768)), DIMS)).toBeNull();
  });

  it('rejects non-base64 characters at the right length', () => {
    expect(decodeVector(`!!!!${valid.slice(4)}`, DIMS)).toBeNull();
  });

  it('rejects characters above the ASCII table', () => {
    // These would index past the reverse-lookup table if it were consulted unguarded.
    expect(decodeVector(`ḥāʿʾ${valid.slice(4)}`, DIMS)).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(decodeVector('', DIMS)).toBeNull();
  });
});
