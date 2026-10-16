/**
 * Copy for the day-complete celebration overlay — pure so it's unit-testable and the overlay stays
 * dumb. Every figure is in the app's orbit degrees ({@link formatDegrees}); the pace line reuses the
 * same whole-month scale as the Progress orbit, so "ahead of last month" is like for like.
 */
import { hijriParts } from '@/lib/dates';
import { daysLeftLabel, type MonthProgress } from '@/lib/progress';
import { formatDegrees } from '@/lib/progress-format';

export type CelebrationCopy = {
  /** e.g. "15 Muḥarram 1448", or null on a runtime whose Intl lacks the Islamic calendar. */
  hijriLabel: string | null;
  /** Completion rate this Hijri month so far, or null when month data is unavailable. */
  rate: number | null;
  /** e.g. "12 days left", or "Last day of the month". Null when month data is unavailable. */
  daysLeftLabel: string | null;
  /** The pace line vs last month, or null on the first month (nothing to compare) / no data. */
  paceLabel: string | null;
};

/**
 * @param hijriDay The day whose Hijri date labels the card — defaults to `day` (the tracking
 *   day), but the caller passes the sunset-turned display day when celebrating after Maghrib:
 *   the Islamic day has already begun, and the shown date honours that. Only the label shifts —
 *   rate / days-left / pace always describe the tracking `month`/`day`.
 */
export function celebrationCopy(month: MonthProgress | null, day: string, hijriDay: string = day): CelebrationCopy {
  const parts = hijriParts(hijriDay);
  const hijriLabel = parts ? `${parts.day} ${parts.monthName} ${parts.year}` : null;

  if (!month) return { hijriLabel, rate: null, daysLeftLabel: null, paceLabel: null };


  let paceLabel: string | null = null;
  if (month.hasPrevious) {
    paceLabel =
      month.thisRate > month.previousRate
        ? "ahead of last month's pace"
        : `last month you were at ${formatDegrees(month.previousRate)}`;
  }

  return { hijriLabel, rate: month.thisRate, daysLeftLabel: daysLeftLabel(month), paceLabel };
}
