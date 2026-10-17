import { describe, expect, it } from '@jest/globals';

import { MILESTONE_ASSET_KEYS } from '@/lib/lunar-phase';
import { moonIllumination, moonPhasePath, sunDirection } from '@/lib/moon';

describe('moonIllumination', () => {
  it('is dark and waxing at the start of the month', () => {
    const { illumination, waxing } = moonIllumination(1, 30);
    expect(illumination).toBeCloseTo(0);
    expect(waxing).toBe(true);
  });

  it('is fully lit at mid-month', () => {
    // Day 16 of a 30-day month → p = 0.5 → fully illuminated.
    const { illumination, waxing } = moonIllumination(16, 30);
    expect(illumination).toBeCloseTo(1);
    expect(waxing).toBe(true);
  });

  it('wanes in the second half of the month', () => {
    expect(moonIllumination(20, 30).waxing).toBe(false);
  });

  it('handles a zero-length month without dividing by zero', () => {
    const { illumination } = moonIllumination(1, 0);
    expect(illumination).toBeCloseTo(0);
  });
});

describe('moonPhasePath', () => {
  it('returns a closed SVG path', () => {
    const path = moonPhasePath(50, 50, 40, 0.5, true);
    expect(path.startsWith('M')).toBe(true);
    expect(path.trimEnd().endsWith('Z')).toBe(true);
    expect(path).toContain('A'); // arc commands draw the limb + terminator
  });
});

/**
 * The moons a notification attaches are PNGs rendered ahead of time by `scripts/gen-moons.mjs`,
 * which necessarily carries its own copy of the geometry above (it is plain Node; this is
 * TypeScript). Nothing at runtime can notice the two drifting apart — the app would simply
 * attach a moon of the wrong shape — so the seam is pinned here instead.
 *
 * If this fails, the generator and the library disagree: run `npm run gen:moons` and update
 * the strings below from its output.
 */
describe('the pre-rendered notification moons', () => {
  // Mirrors the canvas constants in scripts/gen-moons.mjs (re-declared, not imported, like
  // sun.test.ts does with sun.ts's tunables).
  const SIZE = 512;
  const MARGIN = 24;
  const R = (SIZE - MARGIN * 2) / 2;
  const C = SIZE / 2;

  const GOLDEN: Record<string, string> = {
    'd01-l29': 'M 256 24 A 232 232 0 0 1 256 488 A 232 232 0 0 0 256 24 Z',
    'd08-l29': 'M 256 24 A 232 232 0 0 1 256 488 A 12.56022679181688 232 0 0 0 256 24 Z',
    'd15-l29': 'M 256 24 A 232 232 0 0 1 256 488 A 230.6400060598114 232 0 0 1 256 24 Z',
    'd22-l29': 'M 256 24 A 232 232 0 0 0 256 488 A 37.533423200241415 232 0 0 0 256 24 Z',
    'd01-l30': 'M 256 24 A 232 232 0 0 1 256 488 A 232 232 0 0 0 256 24 Z',
    'd08-l30': 'M 256 24 A 232 232 0 0 1 256 488 A 24.25060347809559 232 0 0 0 256 24 Z',
    'd15-l30': 'M 256 24 A 232 232 0 0 1 256 488 A 226.93024337024292 232 0 0 1 256 24 Z',
    'd22-l30': 'M 256 24 A 232 232 0 0 0 256 488 A 71.6919426949878 232 0 0 0 256 24 Z',
  };

  it('covers exactly the keys a lunar update can ask for', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...MILESTONE_ASSET_KEYS].sort());
  });

  it.each(Object.entries(GOLDEN))('draws %s from the app’s own geometry', (key, expected) => {
    const [, day, length] = /^d(\d+)-l(\d+)$/.exec(key) as RegExpExecArray;
    const { illumination, waxing } = moonIllumination(Number(day), Number(length));
    expect(moonPhasePath(C, C, R, illumination, waxing)).toBe(expected);
  });
});

describe('sunDirection', () => {
  const lit = (ill: number, waxing: boolean) => sunDirection(ill, waxing);
  it('is behind the moon at new, behind the viewer at full', () => {
    // Close, not equal: a waning full moon's x is −0, which is the same direction.
    lit(0, true).forEach((v, i) => expect(v).toBeCloseTo([0, 0, -1][i]!, 10));
    lit(1, false).forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i]!, 10));
  });
  it('lights the side the flat drawing lights: the right while waxing, the left while waning', () => {
    const [xWax, , zWax] = lit(0.5, true);
    const [xWane] = lit(0.5, false);
    expect(xWax).toBeCloseTo(1, 10);
    expect(zWax).toBeCloseTo(0, 10);
    expect(xWane).toBeCloseTo(-1, 10);
  });
  it('is a unit vector at every phase', () => {
    for (const ill of [0, 0.1, 0.37, 0.5, 0.8, 1]) {
      const [x, y, z] = lit(ill, true);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
    }
  });
});
