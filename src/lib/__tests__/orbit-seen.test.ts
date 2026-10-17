import { beforeEach, describe, expect, it } from '@jest/globals';

import { orbitArrival, readOrbitSeen, writeOrbitSeen } from '@/lib/orbit-seen';

// The same in-memory Web Storage the preferences tests stand up: under Jest there is no shim, and
// the module resolves `localStorage` per call, so installing it after the imports is fine.
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  },
});

beforeEach(() => store.clear());

describe('orbitArrival', () => {
  it('sweeps a first look from empty, without a beat', () => {
    expect(orbitArrival(null, 0.4)).toEqual({ from: 0, grew: false, closes: false });
  });

  it('stands still when nothing moved since the last look', () => {
    expect(orbitArrival(0.4, 0.4)).toBeNull();
  });

  it('treats a change too small to see in whole degrees as no change', () => {
    // 0.4 and 0.4004 are both 144°.
    expect(orbitArrival(0.4, 0.4004)).toBeNull();
  });

  it('sweeps on from where it was last seen, and is felt as it lands', () => {
    expect(orbitArrival(0.3, 0.45)).toEqual({ from: 0.3, grew: true, closes: false });
  });

  it('steps back quietly when the stripe moved back', () => {
    expect(orbitArrival(0.5, 0.42)).toEqual({ from: 0.5, grew: false, closes: false });
  });

  it('closes the orbit the first time it is seen closed, and only then', () => {
    expect(orbitArrival(0.97, 1)).toMatchObject({ from: 0.97, closes: true });
    expect(orbitArrival(null, 1)).toMatchObject({ from: 0, closes: true });
    expect(orbitArrival(1, 1)).toBeNull();
  });
});

describe('readOrbitSeen / writeOrbitSeen', () => {
  it('reads back what was written, for the same account and month', () => {
    writeOrbitSeen('u1|1448|Rabīʿ al-Thānī', 0.36);
    expect(readOrbitSeen('u1|1448|Rabīʿ al-Thānī')).toBe(0.36);
  });

  it('has never seen another month, or another account', () => {
    writeOrbitSeen('u1|1448|Rabīʿ al-Thānī', 0.36);
    expect(readOrbitSeen('u1|1448|Jumādā al-Ūlā')).toBeNull();
    expect(readOrbitSeen('u2|1448|Rabīʿ al-Thānī')).toBeNull();
  });

  it('reads a corrupt row as never seen', () => {
    store.set('progress.orbitSeen.v1', '{not json');
    expect(readOrbitSeen('u1|1448|Rabīʿ al-Thānī')).toBeNull();
  });
});
