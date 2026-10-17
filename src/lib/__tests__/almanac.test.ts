import { describe, expect, it } from '@jest/globals';

import { tomorrowLine } from '@/lib/almanac';

describe('tomorrowLine', () => {
  // Nothing waiting renders no line at all, rather than an empty one holding space open.
  it('is nothing when tomorrow is holding nothing', () => {
    expect(tomorrowLine([])).toBe(null);
  });

  it('names a single act', () => {
    expect(tomorrowLine(['Fasting on the White Days'])).toBe('Fasting on the White Days');
  });

  it('counts acts past the first', () => {
    expect(tomorrowLine(['One', 'Two', 'Three'])).toBe('3 Sunnah acts');
  });
});
