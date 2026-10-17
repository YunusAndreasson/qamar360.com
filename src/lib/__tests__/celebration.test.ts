import { describe, expect, it } from '@jest/globals';

import { celebrationCopy } from '@/lib/celebration';
import { addDaysISO, hijriParts } from '@/lib/dates';
import type { MonthProgress } from '@/lib/progress';

/** A middle-of-the-month MonthProgress; override per case. */
function month(over: Partial<MonthProgress> = {}): MonthProgress {
  return {
    monthName: 'Muḥarram',
    year: 1448,
    dayOfMonth: 15,
    monthLength: 30,
    thisRate: 0.5,
    averageRate: 0.4,
    monthsAveraged: 1,
    previousRate: 0.4,
    hasPrevious: true,
    ...over,
  };
}

const DAY = '2026-07-11';

describe('celebrationCopy', () => {
  it('preserves the monthly completion rate', () => {
    expect(celebrationCopy(month({ thisRate: 0.5 }), DAY).rate).toBe(0.5); // 180
    expect(celebrationCopy(month({ thisRate: 1 }), DAY).rate).toBe(1);
  });

  it('counts the days left in the Hijri month (after today), pluralised', () => {
    expect(celebrationCopy(month({ dayOfMonth: 15, monthLength: 30 }), DAY).daysLeftLabel).toBe('15 days left');
    expect(celebrationCopy(month({ dayOfMonth: 29, monthLength: 30 }), DAY).daysLeftLabel).toBe('1 day left');
    expect(celebrationCopy(month({ dayOfMonth: 30, monthLength: 30 }), DAY).daysLeftLabel).toBe('Last day of the month');
  });

  it('frames pace vs last month: ahead, behind, or first-month (none)', () => {
    expect(celebrationCopy(month({ thisRate: 0.5, previousRate: 0.4 }), DAY).paceLabel).toBe(
      'ahead of last month’s pace',
    );
    expect(celebrationCopy(month({ thisRate: 0.3, previousRate: 0.45 }), DAY).paceLabel).toBe(
      `last month you were at 162°`,
    );
    // Equal is not "ahead" — falls to the behind/at-parity form.
    expect(celebrationCopy(month({ thisRate: 0.4, previousRate: 0.4 }), DAY).paceLabel).toContain('last month');
    expect(celebrationCopy(month({ hasPrevious: false }), DAY).paceLabel).toBeNull();
  });

  it('formats the Hijri date from hijriParts', () => {
    const p = hijriParts(DAY);
    expect(p).not.toBeNull();
    expect(celebrationCopy(month(), DAY).hijriLabel).toBe(`${p!.day} ${p!.monthName} ${p!.year}`);
  });

  it('labels with the display day when it differs (post-Maghrib), while stats stay on the tracking day', () => {
    // After the real sunset the Islamic day has turned: the label follows the display day…
    const tomorrow = addDaysISO(DAY, 1);
    const p = hijriParts(tomorrow);
    expect(p).not.toBeNull();
    const copy = celebrationCopy(month({ thisRate: 0.5, dayOfMonth: 15, monthLength: 30 }), DAY, tomorrow);
    expect(copy.hijriLabel).toBe(`${p!.day} ${p!.monthName} ${p!.year}`);
    // …but degrees and days-left still describe the tracking day's month.
    expect(copy.rate).toBe(0.5);
    expect(copy.daysLeftLabel).toBe('15 days left');
  });

  it('degrades gracefully when there is no month data (keeps the Hijri date)', () => {
    const copy = celebrationCopy(null, DAY);
    expect(copy.rate).toBeNull();
    expect(copy.daysLeftLabel).toBeNull();
    expect(copy.paceLabel).toBeNull();
    expect(copy.hijriLabel).toBe(celebrationCopy(month(), DAY).hijriLabel); // date still computed
  });
});
