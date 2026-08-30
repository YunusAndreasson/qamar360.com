import { describe, expect, it } from '@jest/globals';

import { tomorrowLine } from '@/lib/almanac';

describe('tomorrowLine', () => {
  // Nothing waiting renders no line at all, rather than an empty one holding space open.
  it('is nothing when tomorrow is holding nothing', () => {
    expect(tomorrowLine([], [])).toBe(null);
  });

  it('names a single act', () => {
    expect(tomorrowLine(['Fasting on the White Days'], [])).toBe('Fasting on the White Days');
  });

  it('counts acts past the first', () => {
    expect(tomorrowLine(['One', 'Two', 'Three'], [])).toBe('3 Sunnah acts');
  });

  // The whole reason the line learned about to-dos: this is the only place one put on tomorrow
  // can be seen before tomorrow.
  it('names a single to-do', () => {
    expect(tomorrowLine([], ['Ferry tickets'])).toBe('Ferry tickets');
  });

  it('counts to-dos past the first', () => {
    expect(tomorrowLine([], ['Ferry tickets', 'Pack the car'])).toBe('2 to-dos');
  });

  // Counted separately, so the one thing you chose to put there is still named beside the acts.
  it('keeps the two kinds apart', () => {
    expect(tomorrowLine(['One', 'Two'], ['Ferry tickets'])).toBe('2 Sunnah acts, Ferry tickets');
  });

  it('names one of each', () => {
    expect(tomorrowLine(['Fasting'], ['Ferry tickets'])).toBe('Fasting, Ferry tickets');
  });
});
