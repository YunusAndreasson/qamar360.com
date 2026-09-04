import { describe, expect, it } from '@jest/globals';

import { formatPercent } from '@/lib/progress-format';

describe('formatPercent', () => {
  it('distinguishes missing data, zero, and small positive progress', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.004)).toBe('<1%');
  });
  it('does not show completion before the target is reached', () => {
    expect(formatPercent(0.999)).toBe('99%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.456)).toBe('46%');
  });
  it('bounds out-of-range rates', () => {
    expect(formatPercent(-1)).toBe('0%');
    expect(formatPercent(2)).toBe('100%');
  });
});
