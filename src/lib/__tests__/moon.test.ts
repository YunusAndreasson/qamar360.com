import { describe, expect, it } from '@jest/globals';

import { moonIllumination, moonPhasePath } from '@/lib/moon';

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
