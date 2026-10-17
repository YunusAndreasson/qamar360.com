import { addDaysISO, hijriMonthRange, hijriParts } from '@/lib/dates';
import { phaseOf } from '@/lib/lunar-phase';

/** The White Days (al-ayyām al-bīḍ), the 13th to the 15th of a Hijri month: the full moon's nights. */
const WHITE_DAYS_FIRST = 13;
const WHITE_DAYS_LAST = 15;

/**
 * What the moon is doing this Hijri month, for the orbit's sheet: tonight's phase, the White Days
 * still to come, and when the next month begins.
 *
 * Read from the Hijri calendar, like every moon the app draws, so the phase named here is the one
 * on the card and the dates are the ones the White Days habit is scheduled on. Not the ephemeris:
 * a day that names one phase while the card draws another is worse than either.
 */
export type MoonAlmanac = {
  tonight: { label: string; illumination: number; waxing: boolean };
  /** This month's White Days until the last of them has passed, then next month's. */
  whiteDays: { start: string; end: string };
  /** The month after this one, and the day it begins. */
  nextMonth: { name: string; start: string };
};

/** The almanac for the Hijri month containing `today`; `null` without an Islamic calendar. */
export function moonAlmanac(today: string): MoonAlmanac | null {
  const range = hijriMonthRange(today);
  const day = hijriParts(today)?.day;
  if (!range || day === undefined) return null;
  const { label, illumination, waxing } = phaseOf(day, range.length);
  const nextStart = addDaysISO(range.end, 1);
  const whiteFrom = day <= WHITE_DAYS_LAST ? range.start : nextStart;
  return {
    tonight: { label, illumination, waxing },
    whiteDays: { start: addDaysISO(whiteFrom, WHITE_DAYS_FIRST - 1), end: addDaysISO(whiteFrom, WHITE_DAYS_LAST - 1) },
    nextMonth: { name: hijriParts(nextStart)?.monthName ?? '', start: nextStart },
  };
}
