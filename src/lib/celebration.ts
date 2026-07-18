/**
 * Copy for the day-complete celebration overlay — pure so it's unit-testable and the overlay stays
 * dumb. Turns the Hijri day + this month's {@link MonthProgress} into the strings the card shows.
 * All degrees use the app's lunar-orbit unit (see {@link toDegrees}); the pace line reuses the same
 * whole-month scale as the Progress orbit, so "ahead of last month" is a like-for-like comparison.
 */
import { hijriParts } from '@/lib/dates';
import { toDegrees, type MonthProgress } from '@/lib/progress';

export type CelebrationCopy = {
  /** e.g. "15 Muḥarram 1448", or null on a runtime whose Intl lacks the Islamic calendar. */
  hijriLabel: string | null;
  /** Degrees earned this Hijri month so far, or null when month data is unavailable. */
  degrees: number | null;
  /** e.g. "12 days left", or "Last day of the month". Null when month data is unavailable. */
  daysLeftLabel: string | null;
  /** The pace line vs last month, or null on the first month (nothing to compare) / no data. */
  paceLabel: string | null;
};

/**
 * @param hijriDay The day whose Hijri date labels the card — defaults to `day` (the tracking
 *   day), but the caller passes the sunset-turned display day when celebrating after Maghrib:
 *   the Islamic day has already begun, and the shown date honours that. Only the label shifts —
 *   degrees / days-left / pace always describe the tracking `month`/`day`.
 */
export function celebrationCopy(month: MonthProgress | null, day: string, hijriDay: string = day): CelebrationCopy {
  const parts = hijriParts(hijriDay);
  const hijriLabel = parts ? `${parts.day} ${parts.monthName} ${parts.year}` : null;

  if (!month) return { hijriLabel, degrees: null, daysLeftLabel: null, paceLabel: null };

  const left = month.monthLength - month.dayOfMonth;
  const daysLeftLabel = left <= 0 ? 'Last day of the month' : `${left} ${left === 1 ? 'day' : 'days'} left`;

  let paceLabel: string | null = null;
  if (month.hasPrevious) {
    paceLabel =
      month.thisRate > month.previousRate
        ? "ahead of last month's pace"
        : `last month you were at ${toDegrees(month.previousRate)}°`;
  }

  return { hijriLabel, degrees: toDegrees(month.thisRate), daysLeftLabel, paceLabel };
}
