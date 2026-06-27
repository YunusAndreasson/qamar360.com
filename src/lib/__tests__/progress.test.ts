import { describe, expect, it } from '@jest/globals';

import { clamp01, toDegrees } from '@/lib/progress';

describe('clamp01', () => {
  it('clamps below 0 and above 1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });

  it('passes through values already in range', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
  });
});

describe('toDegrees', () => {
  it('maps a completion rate to whole orbit degrees', () => {
    expect(toDegrees(0)).toBe(0);
    expect(toDegrees(0.25)).toBe(90);
    expect(toDegrees(0.5)).toBe(180);
    expect(toDegrees(1)).toBe(360);
  });

  it('clamps out-of-range rates', () => {
    expect(toDegrees(-1)).toBe(0);
    expect(toDegrees(2)).toBe(360);
  });
});
