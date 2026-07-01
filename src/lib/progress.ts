/**
 * Progress math, shared by every chart. Completion in this app is shown around a lunar orbit,
 * so a rate (0–1) is expressed in orbit *degrees*, never percent — see the Progress screen.
 * Kept here so the moon ring, the month grid and the year strip compute it identically.
 *
 * `computeProgress` lives here (not in the hook) so it stays a pure function with no React or
 * Supabase imports — directly unit-testable.
 */

import type { Tables } from '@/lib/database.types';
import {
  addDaysISO,
  hijriMonthRange,
  hijriParts,
  hijriYearStart,
  scheduledOn,
  type HijriSchedule,
} from '@/lib/dates';

/** A full orbit — 100% completion. */
const FULL_CIRCLE_DEGREES = 360;

/** Clamp a value into the 0–1 completion range. */
export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** A completion rate (0–1) as whole orbit degrees — the app's unit for progress. */
export function toDegrees(rate: number): number {
  return Math.round(clamp01(rate) * FULL_CIRCLE_DEGREES);
}

/**
 * The geometry of a progress ring of pixel `size` drawn with `strokeWidth`, filled to `fraction`
 * (0–1). Shared by the checklist's completion ring and the Progress moon rings so both lay out the
 * arc identically. `arc` / `circumference` feed an SVG `strokeDasharray`.
 */
export function ringMetrics(size: number, strokeWidth: number, fraction: number) {
  const clamped = clamp01(fraction);
  const radius = size / 2;
  const ringRadius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  return { clamped, isComplete: clamped >= 1, radius, ringRadius, circumference, arc: circumference * clamped };
}

/** The minimal habit shape {@link computeProgress} needs — `Habit` satisfies it structurally. */
export type ProgressHabit = {
  id: string;
  created_at: string | null;
  schedule_days: number[];
  hijri_schedule?: HijriSchedule | null;
  /** A count-goal target (e.g. 5 pages); a scheduled day earns `count ÷ target` credit. Null = binary. */
  target_count?: number | null;
};

/** The completion-row fields the progress math reads. */
export type CompletionRow = Pick<Tables<'habit_completions'>, 'habit_id' | 'completed_at' | 'status' | 'count'>;

/** One day of the current Hijri month, for the "This month" bars. */
export type MonthDay = {
  /** Day of the Hijri month, 1-based. */
  day: number;
  /** completed / possible for that day, 0–1; 0 when nothing was scheduled. */
  fraction: number;
  /** 'past' = before today, 'today' = today, 'future' = not yet reached. */
  state: 'past' | 'today' | 'future';
};

/**
 * This Hijri month: its date (for the moon hero's lunar phase), its completion so far (the
 * overall %), and its day-by-day shape (the bars). `null` when the platform's `Intl` lacks
 * the Islamic calendar.
 */
export type MonthProgress = {
  /** Hijri month name, e.g. "Muharram". */
  monthName: string;
  /** Hijri year, e.g. 1448. */
  year: number;
  /** Today's day of the Hijri month, 1-based. */
  dayOfMonth: number;
  /** Days in this Hijri month (29 or 30). */
  monthLength: number;
  /**
   * Whole-month completion so far, 0–1: acts done month-to-date ÷ acts scheduled across the
   * FULL month. The single source of truth for the orbit/degrees — so a perfect day reads as a
   * small slice, and rate 1 (360°) means the whole month is actually complete.
   */
  thisRate: number;
  /** Previous Hijri month name, for the pace comparison ("vs last month"). */
  previousMonthName: string;
  /**
   * Last month by this same Hijri day, on the same whole-month scale (0–1): acts done through
   * the matching day ÷ last month's full possible — directly comparable to {@link thisRate}.
   */
  previousRate: number;
  /** Whether last month was tracked at all (false → the user's first month; hide the pace tick). */
  hasPrevious: boolean;
  /** Every day of the month, 1 → last — the per-day bars (future days empty). */
  days: MonthDay[];
};

/** One Hijri month of the current year, for the "This year" bars. */
type YearMonth = {
  /** 1-based Hijri month number (1 = Muharram … 12 = Dhul-Hijjah). */
  month: number;
  /** Hijri month name, e.g. "Rajab". */
  monthName: string;
  /** Completion rate, 0–1 — full month for the past, whole-month progress for the current, 0 for the future. */
  fraction: number;
  /** 'past' = fully elapsed, 'current' = contains today, 'future' = not yet begun. */
  state: 'past' | 'current' | 'future';
};

/**
 * This Hijri year as its 12 months — the "year in moons" strip. `null` when the
 * Islamic calendar is unavailable.
 */
export type YearProgress = {
  /** Hijri year, e.g. 1448. */
  year: number;
  /** Muharram → Dhul-Hijjah, always length 12. */
  months: YearMonth[];
};

/** Everything the Progress screen derives from the raw rows. */
export type ProgressDerived = {
  habitsCount: number;
  /** This Hijri month's completion so far — the moon ring, or `null` if unavailable. */
  month: MonthProgress | null;
  /** This Hijri year as 12 months — the year bars, or `null` if unavailable. */
  year: YearProgress | null;
};

/** Derive every progress metric from the raw rows. Pure — easy to reason about and test. */
export function computeProgress(
  habits: ProgressHabit[],
  completions: CompletionRow[],
  today: string,
): ProgressDerived {
  // date → (habit id → its completion row) for that day. A skipped act is excluded from the
  // rate entirely (numerator AND denominator), so it never counts as a miss — travel/period
  // days can still read 100%. A count goal earns partial credit (count ÷ target); a 'partial'
  // row is an in-progress count goal.
  const rowByDate = new Map<string, Map<string, CompletionRow>>();
  for (const row of completions) {
    let m = rowByDate.get(row.completed_at);
    if (!m) {
      m = new Map();
      rowByDate.set(row.completed_at, m);
    }
    m.set(row.habit_id, row);
  }

  // One scheduled habit's credit toward a day's rate: `null` = excused (drop from numerator
  // AND denominator); otherwise 0–1. A count goal earns `count ÷ target` (capped at 1); a
  // binary habit earns 1 when 'done', else 0.
  const habitCredit = (h: ProgressHabit, iso: string): number | null => {
    const row = rowByDate.get(iso)?.get(h.id);
    if (row?.status === 'skipped') return null; // excused — out of the rate entirely
    if (h.target_count && h.target_count > 0) {
      if (row?.status === 'done') return 1; // reached target
      return clamp01((row?.count ?? 0) / h.target_count); // in-progress count goal
    }
    return row?.status === 'done' ? 1 : 0; // binary
  };

  // A day's completion fraction (credit ÷ scheduled, minus excused), for the per-day month bars.
  const dayFraction = (iso: string): number => {
    let c = 0;
    let p = 0;
    for (const h of habits) {
      if (!scheduledOn(h, iso)) continue;
      const credit = habitCredit(h, iso);
      if (credit === null) continue; // excused — out of the rate entirely
      p += 1;
      c += credit;
    }
    return p ? c / p : 0;
  };

  // This Hijri month vs last, as a completion *rate* (done / scheduled). A rate
  // normalises across changing habit counts and month lengths, so 100% always
  // means a perfect month regardless of how many acts that is.
  const tallyRange = (startISO: string, endISO: string): { done: number; possible: number } => {
    let done = 0;
    let possible = 0;
    for (let day = startISO; day <= endISO; day = addDaysISO(day, 1)) {
      for (const h of habits) {
        if (!scheduledOn(h, day)) continue;
        const credit = habitCredit(h, day);
        if (credit === null) continue; // excused — excluded from done and possible
        possible += 1;
        done += credit; // count goals add a fraction; binary habits add 1 or 0
      }
    }
    return { done, possible };
  };
  let month: MonthProgress | null = null;
  const thisRange = hijriMonthRange(today);
  if (thisRange) {
    const dayOfMonth = hijriParts(today)?.day ?? 1;
    // The ring measures progress through the WHOLE month: the numerator is acts completed
    // month-to-date, but the denominator is every act scheduled across the full month. So a
    // single perfect day is a small slice — 360° means the whole month is done, never "100%
    // of what was possible so far" (which made one perfect day fill the orbit).
    const here = tallyRange(thisRange.start, today); // month-to-date → the done count
    const whole = tallyRange(thisRange.start, thisRange.end); // whole month → the denominator
    const previousRange = hijriMonthRange(addDaysISO(thisRange.start, -1));
    // Last month on the same whole-month scale: completed through the matching Hijri day, over
    // last month's full possible — so the orbit's "vs last month" tick reads as a comparable
    // position to the headline (both are "fraction of that whole month done by this point").
    const previousLimit = previousRange
      ? addDaysISO(previousRange.start, Math.min(dayOfMonth, previousRange.length) - 1)
      : null;
    const previousThrough = previousRange && previousLimit ? tallyRange(previousRange.start, previousLimit) : { done: 0, possible: 0 };
    const previousWhole = previousRange ? tallyRange(previousRange.start, previousRange.end) : { done: 0, possible: 0 };
    const days: MonthDay[] = [];
    for (let i = 0; i < thisRange.length; i += 1) {
      const iso = addDaysISO(thisRange.start, i);
      const state: MonthDay['state'] = iso < today ? 'past' : iso === today ? 'today' : 'future';
      days.push({ day: i + 1, fraction: state === 'future' ? 0 : dayFraction(iso), state });
    }
    month = {
      monthName: thisRange.monthName,
      year: thisRange.year,
      dayOfMonth,
      monthLength: thisRange.length,
      // Computed once here so every chart reads the same rate (no inline done/possible divides).
      thisRate: whole.possible > 0 ? here.done / whole.possible : 0,
      previousMonthName: previousRange?.monthName ?? '',
      previousRate: previousWhole.possible > 0 ? previousThrough.done / previousWhole.possible : 0,
      hasPrevious: previousWhole.possible > 0,
      days,
    };
  }

  // This Hijri year as its 12 months — Muharram → Dhul-Hijjah. Past months carry their
  // full rate, the current month its whole-month progress (done-to-date over the whole
  // month), future months are empty (new moons). Walks forward month by month from 1
  // Muharram using the same day arithmetic.
  let year: YearProgress | null = null;
  const yearStart = hijriYearStart(today);
  if (yearStart) {
    const months: YearMonth[] = [];
    let cursor = yearStart.start;
    for (let m = 1; m <= 12; m += 1) {
      const range = hijriMonthRange(cursor);
      if (!range) break;
      let state: YearMonth['state'];
      let tally = { done: 0, possible: 0 };
      if (range.start > today) {
        state = 'future';
      } else if (range.end <= today) {
        state = 'past';
        tally = tallyRange(range.start, range.end); // a fully elapsed month — full-month rate
      } else {
        state = 'current';
        // Same whole-month denominator as the month ring (done month-to-date, possible over the
        // whole month), so the current moon fills gradually instead of snapping full on day 1.
        tally = { done: tallyRange(range.start, today).done, possible: tallyRange(range.start, range.end).possible };
      }
      months.push({
        month: m,
        monthName: range.monthName,
        fraction: tally.possible ? tally.done / tally.possible : 0,
        state,
      });
      cursor = addDaysISO(range.end, 1); // the 1st of the next Hijri month
    }
    if (months.length === 12) year = { year: yearStart.year, months };
  }

  return { habitsCount: habits.length, month, year };
}
