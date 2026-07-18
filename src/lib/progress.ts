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

/**
 * Whether a stack has just been sealed — every act it has due today is done, and it's a
 * genuine *group* (≥2 acts due), so a stack with a single act scheduled today reads as a plain
 * tick rather than a milestone. Skipped members are excused — out of the stack's "open" set, the
 * same way {@link computeProgress} and the day-complete rule drop an excused act. `justCompletedId`
 * lets the completion handler count the id it is ticking as done before its optimistic state has
 * propagated (mirroring the day-complete seam's stale-read guard); the card omits it, since by the
 * time it re-renders its `completed` set already reflects the tick.
 *
 * The single source of truth for "stack complete" — the card's border flash and the synced
 * completion haptic both read it, so the flash and the buzz can never disagree.
 */
export function isStackComplete(
  members: { id: string }[],
  completed: Set<string>,
  skipped: Set<string>,
  justCompletedId?: string,
): boolean {
  const open = members.filter((m) => !skipped.has(m.id));
  if (open.length < 2) return false;
  return open.every((m) => m.id === justCompletedId || completed.has(m.id));
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
export type YearMonth = {
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

/**
 * The improvement trend, read off COMPLETE Hijri months only: how many consecutive closed
 * months (ending with the most recent one) rose strictly, whole-month rate over whole-month
 * rate. The current, in-progress month is excluded — its month-to-date rate measured against
 * closed months would read as a dip at every month's start. One increase is noise, not a
 * direction, so `risingMonths` is 0 or ≥ 3. There is deliberately no falling counterpart —
 * silence, not shame (the same negative space as {@link import('./celebration').celebrationCopy}).
 */
export type TrendSummary = {
  /** Consecutive complete Hijri months whose rates strictly rise; 0 (no trend) or ≥ 3. */
  risingMonths: number;
  /** Name of the Hijri month the ascent began (the run's first month), or null without a run. */
  sinceMonthName: string | null;
};

/** Everything the Progress screen derives from the raw rows. */
export type ProgressDerived = {
  habitsCount: number;
  /** This Hijri month's completion so far — the moon ring, or `null` if unavailable. */
  month: MonthProgress | null;
  /** This Hijri year as 12 months — the year bars, or `null` if unavailable. */
  year: YearProgress | null;
  /** The rising-months statement ("Rising since …"), or `null` if the calendar is unavailable. */
  trend: TrendSummary | null;
};

/**
 * Overlay a set of known-done habit ids onto `day`'s completion rows. The day-complete overlay
 * fires the instant the day closes — BEFORE the last ticks have round-tripped to the server — so a
 * plain fetch undercounts and its degrees read below the Progress tab's (e.g. 74° vs 77°). Feeding
 * it the caller's optimistic "done today" set (the ids the day-complete rule already proved done)
 * keeps both readings on the same data, so they agree. Pure. Replaces any existing row for those
 * habits on `day` with a 'done' row — a count goal that closed the day has reached its target, so it
 * earns full credit. No-op when `doneIds` is empty (every other caller).
 */
export function withDoneToday(completions: CompletionRow[], doneIds: string[], day: string): CompletionRow[] {
  if (doneIds.length === 0) return completions;
  const done = new Set(doneIds);
  const kept = completions.filter((r) => !(r.completed_at === day && done.has(r.habit_id)));
  const injected: CompletionRow[] = doneIds.map((habit_id) => ({ habit_id, completed_at: day, status: 'done', count: null }));
  return [...kept, ...injected];
}

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
    const dayOfMonth = hijriParts(today)!.day; // thisRange is non-null ⟹ hijriParts(today) is too
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

  // The improvement trend: walk BACK from this month across closed months (crossing the Hijri
  // year boundary — the year strip above can't power this, it restarts every Muḥarram), collecting
  // each one's whole-month rate until the first month with nothing scheduled (before tracking
  // began) or the window's honest capacity (the fetch pulls ~a year). Then count the strictly
  // rising run from the most recent closed month backward.
  let trend: TrendSummary | null = null;
  if (thisRange) {
    const rates: { rate: number; monthName: string }[] = []; // newest complete month first
    let cursor = addDaysISO(thisRange.start, -1); // the last day of the previous month
    for (let back = 0; back < 12; back += 1) {
      const range = hijriMonthRange(cursor);
      if (!range) break;
      const tally = tallyRange(range.start, range.end);
      if (tally.possible === 0) break; // nothing was ever scheduled — before tracking began
      rates.push({ rate: tally.done / tally.possible, monthName: range.monthName });
      cursor = addDaysISO(range.start, -1);
    }
    // Strict `>` — rates are exact rationals, and a plateau is not a rise.
    let increases = 0;
    while (increases + 1 < rates.length && rates[increases]!.rate > rates[increases + 1]!.rate) increases += 1;
    trend =
      increases >= 2
        ? { risingMonths: increases + 1, sinceMonthName: rates[increases]!.monthName }
        : { risingMonths: 0, sinceMonthName: null };
  }

  return { habitsCount: habits.length, month, year, trend };
}
