import { describe, expect, it } from '@jest/globals';

import { addDaysISO, hijriMonthRange, hijriParts } from '@/lib/dates';
import { moonAlmanac } from '@/lib/moon-almanac';

/** The `n`th day (1-based) of the Hijri month that contains `iso`. */
function dayOf(iso: string, n: number): string {
  const range = hijriMonthRange(iso);
  if (!range) throw new Error('Islamic calendar unavailable in this test environment');
  return addDaysISO(range.start, n - 1);
}

const ANCHOR = '2026-10-17';

describe('moonAlmanac', () => {
  it("names tonight's phase from the Hijri day, as the drawn moon does", () => {
    expect(moonAlmanac(dayOf(ANCHOR, 1))!.tonight.label).toBe('New moon');
    expect(moonAlmanac(dayOf(ANCHOR, 15))!.tonight.label).toBe('Full moon');
    expect(moonAlmanac(dayOf(ANCHOR, 6))!.tonight).toMatchObject({ label: 'Waxing crescent', waxing: true });
  });

  it("gives this month's White Days, the 13th to the 15th, until they have passed", () => {
    for (const n of [1, 13, 15]) {
      const { whiteDays } = moonAlmanac(dayOf(ANCHOR, n))!;
      expect(hijriParts(whiteDays.start)!.day).toBe(13);
      expect(hijriParts(whiteDays.end)!.day).toBe(15);
      expect(whiteDays.start).toBe(dayOf(ANCHOR, 13));
    }
  });

  it("gives next month's White Days once this month's are over", () => {
    const today = dayOf(ANCHOR, 16);
    const { whiteDays, nextMonth } = moonAlmanac(today)!;
    expect(whiteDays.start > today).toBe(true);
    expect(hijriParts(whiteDays.start)).toMatchObject({ day: 13, monthName: nextMonth.name });
    expect(hijriParts(whiteDays.end)).toMatchObject({ day: 15, monthName: nextMonth.name });
  });

  it('begins the next month the day after this one ends, by name', () => {
    const today = dayOf(ANCHOR, 6);
    const { nextMonth } = moonAlmanac(today)!;
    expect(nextMonth.start).toBe(addDaysISO(hijriMonthRange(today)!.end, 1));
    expect(hijriParts(nextMonth.start)).toMatchObject({ day: 1, monthName: nextMonth.name });
    expect(nextMonth.name).not.toBe(hijriParts(today)!.monthName);
  });
});
