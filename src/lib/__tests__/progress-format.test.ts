import { describe, expect, it } from '@jest/globals';

import { formatDegrees, orbitDegrees } from '@/lib/progress-format';

describe('formatDegrees', () => {
  it('distinguishes missing data, zero, and small positive progress', () => {
    expect(formatDegrees(null)).toBe('—');
    expect(formatDegrees(Number.NaN)).toBe('—');
    expect(formatDegrees(0)).toBe('0°');
    // 0.001 of a month rounds to 0°, but something done is never shown as nothing done.
    expect(formatDegrees(0.001)).toBe('1°');
  });

  it('never awards the full orbit before the month is kept', () => {
    // 0.999 rounds to 360°; the moon only lights at a whole month, so the number waits too.
    expect(formatDegrees(0.999)).toBe('359°');
    expect(formatDegrees(1)).toBe('360°');
    expect(formatDegrees(0.5)).toBe('180°');
  });

  it('bounds out-of-range rates', () => {
    expect(formatDegrees(-1)).toBe('0°');
    expect(formatDegrees(2)).toBe('360°');
  });
});

describe('orbitDegrees', () => {
  it('is the same guarded figure as a number, for tallies that count up to it', () => {
    expect(orbitDegrees(0.001)).toBe(1);
    expect(orbitDegrees(0.999)).toBe(359);
    expect(orbitDegrees(0.25)).toBe(90);
  });
});
