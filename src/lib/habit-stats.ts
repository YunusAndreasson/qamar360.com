/**
 * Per-habit stats math, powering the "Stats" screen — the single-habit sibling of
 * {@link import('./progress').computeProgress} (which aggregates across all habits for the
 * Progress tab). Like it, this is a pure function with no React or Supabase imports, so it stays
 * directly unit-testable.
 *
 * The completion rule (binary / count-goal partial / skip-excusal) is NOT re-implemented here —
 * it's the shared {@link creditOnDay} from `progress.ts`, so a single habit and the whole-app
 * rate can never disagree. Rates stay 0–1 throughout; the degrees convention is applied at the
 * presentation edge (the charts call `toDegrees`).
 *
 * This module also owns the {@link HabitStats} shape and the sweep that derives it
 * ({@link statsFromDailyCredit}), which `stack-stats.ts` reuses for the *stack* Stats screen.
 * The two units differ only in what one day is worth; every rule after that — what "pending" means,
 * what an excused day does to a streak, how a best day is chosen — is decided once, here, so the
 * two screens can't quietly grow different arithmetic behind the same four cards.
 */

import { addDaysISO, weekdayIndex } from '@/lib/dates';
import { creditOnDay, type CompletionRow, type ProgressHabit } from '@/lib/progress';

/** How far back the stats window reaches by default — a little over a year, so a full year of
 *  weekday and streak history is in view. The completions query only returns rows that exist, so
 *  the payload scales with real usage, not the window. */
export const STATS_WINDOW_DAYS = 365;

/** Weeks sampled for the over-time trend, and the trailing window each sample averages over. A
 *  4-week rolling rate smooths the jumpiness a sparse (e.g. twice-weekly) habit would show if each
 *  point were a single raw week. */
const TREND_WEEKS = 12;
const TREND_ROLL_DAYS = 28;

/** One weekday's completion, Sun(0)→Sat(6). */
export type WeekdayStat = {
  /** 0=Sunday … 6=Saturday (matches `weekdayIndex` and `schedule_days`). */
  weekday: number;
  /** How many times this weekday was scheduled (and not excused) across the window — the sample size. */
  scheduledCount: number;
  /** completed ÷ scheduled for this weekday, 0–1 (0 when never scheduled). */
  rate: number;
};

/** One sampled point of the over-time trend line. */
export type TrendPoint = {
  /** The day this sample ends on (`YYYY-MM-DD`), newest sample = today. */
  weekEndISO: string;
  /** Trailing {@link TREND_ROLL_DAYS}-day completion rate at that point, 0–1. */
  rate: number;
  /** Scheduled (non-excused, closed) days inside the sample's window — the sample size. 0 means
   *  the habit didn't run at all in that window (e.g. it didn't exist yet): the rate carries no
   *  signal, and the chart/trend copy must treat the point as absent rather than as an 0° miss. */
  scheduledCount: number;
};

/** Everything the Stats screen derives from one habit's raw completion rows. */
export type HabitStats = {
  /** Closed days this habit was scheduled (and not excused) across the window — the consistency
   *  sample size. A still-open today is pending (see the sweep) and not yet part of the sample. */
  scheduledDays: number;
  /** Σ credit ÷ {@link scheduledDays} across the window, 0–1 — the headline consistency. */
  consistency: number;
  /** Per-weekday completion, Sunday→Saturday (always length 7; only `scheduledCount > 0` entries carry signal). */
  byWeekday: WeekdayStat[];
  /** The scheduled weekday with the highest rate (ties → the more-scheduled day), or `null` when the
   *  habit ran on no weekday in the window. */
  bestWeekday: number | null;
  /** The scheduled weekday with the lowest rate — only when it genuinely differs from {@link bestWeekday}
   *  (≥ 2 active weekdays and a strictly lower rate), else `null` (a single soft day is not a "tough" day). */
  toughestWeekday: number | null;
  /** Consecutive scheduled days done, ending at the most recent closed scheduled day. Today, if still
   *  open, is *pending* — it never breaks the run. Skipped days are neutral (excused). */
  currentStreak: number;
  /** The longest such run anywhere in the window. */
  longestStreak: number;
  /** Rolling completion rate sampled weekly (oldest → newest) — the over-time line. */
  trend: TrendPoint[];
  /** False for Hijri-scheduled habits (White Days, Ramaḍān, annual dates): a weekday distribution
   *  is meaningless there, so the screen shows the schedule instead of the weekday bars. */
  weekdayApplicable: boolean;
};

/**
 * What one day was worth to the unit being measured:
 * - `undefined` — the unit wasn't due that day, and the day is **invisible** to every stat;
 * - `null` — **excused**, so it leaves the rate entirely and is neutral for the streak;
 * - `0`–`1` — the credit earned.
 *
 * A habit reads this straight off {@link creditOnDay}; a stack resolves it across its acts. Splitting
 * the day's worth from everything downstream is what lets both share one sweep.
 */
export type DailyCredit = number | null | undefined;

/**
 * The sweep every Stats screen is built from: consistency, weekday buckets, both streaks and
 * the over-time trend, derived from nothing but "what was each day worth" ({@link DailyCredit}).
 *
 * Shared by {@link computeHabitStats} and `computeStackStats` so the two units can't disagree about
 * the rules that aren't about their difference — chiefly that a still-open **today is pending**
 * (never a miss, never in the sample) and that an **excused day is neutral** rather than a zero.
 */
export function statsFromDailyCredit(
  creditOnDay: (iso: string) => DailyCredit,
  today: string,
  weekdayApplicable: boolean,
  windowDays = STATS_WINDOW_DAYS,
): HabitStats {
  const start = addDaysISO(today, -(windowDays - 1));

  // ── Consistency + weekday buckets, and the streaks, in one chronological sweep ──
  // The weekday buckets tally credit over scheduled, non-excused days. The streak run is tracked
  // as we go: `done` (credit 1) extends it, a real miss (scheduled, not done, not today) resets it,
  // skipped/pending days are neutral. Because the sweep ends at `today`, the run's final value IS
  // the current streak, and the max run seen is the longest — no second pass needed.
  const weekday = Array.from({ length: 7 }, () => ({ done: 0, scheduled: 0 }));
  let done = 0;
  let scheduled = 0;
  let run = 0;
  let longestStreak = 0;
  for (let iso = start; iso <= today; iso = addDaysISO(iso, 1)) {
    const credit = creditOnDay(iso);
    if (credit === undefined) continue; // a day this unit wasn't due — invisible to every stat

    // Streak state for this scheduled day.
    if (credit === 1) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else if (iso === today || credit === null) {
      // Today still open (or partial) is *pending* — not a miss yet; a skipped day is excused.
      // Either way the run neither extends nor breaks.
    } else {
      run = 0; // a genuine miss (or a past partial that never reached target) ends the run
    }

    if (credit === null) continue; // excused — out of the completion rate entirely
    if (iso === today && credit < 1) continue; // today still open is pending, not a miss —
    // the same rule the streak applies. Counting it would dip the consistency ring (and its
    // weekday bucket) every midnight and "recover" on tick, while the streak card right
    // beside them says the run is intact.
    scheduled += 1;
    done += credit;
    const wd = weekdayIndex(iso);
    weekday[wd]!.scheduled += 1;
    weekday[wd]!.done += credit;
  }
  const currentStreak = run;

  const consistency = scheduled > 0 ? done / scheduled : 0;
  const byWeekday: WeekdayStat[] = weekday.map((w, i) => ({
    weekday: i,
    scheduledCount: w.scheduled,
    rate: w.scheduled > 0 ? w.done / w.scheduled : 0,
  }));

  // Best / toughest among the weekdays this habit actually runs on. Best breaks ties toward the
  // more-scheduled weekday (more evidence behind the claim). Toughest needs ≥ 2 active weekdays and
  // a strictly lower rate than the best, else it's noise rather than a real contrast.
  const active = byWeekday.filter((w) => w.scheduledCount > 0);
  let bestWeekday: number | null = null;
  let toughestWeekday: number | null = null;
  if (active.length > 0) {
    const best = active.reduce((a, b) =>
      b.rate > a.rate || (b.rate === a.rate && b.scheduledCount > a.scheduledCount) ? b : a,
    );
    // A "best day" only means something once *some* day has been completed — with zero
    // completions every weekday ties at 0, and naming one "your strongest" would be a lie.
    if (best.rate > 0) bestWeekday = best.weekday;
    if (bestWeekday !== null && active.length > 1) {
      const worst = active.reduce((a, b) =>
        b.rate < a.rate || (b.rate === a.rate && b.scheduledCount > a.scheduledCount) ? b : a,
      );
      if (worst.weekday !== best.weekday && worst.rate < best.rate) toughestWeekday = worst.weekday;
    }
  }

  // ── Over-time trend: a trailing rolling rate sampled once a week, ending at today ──
  const trend: TrendPoint[] = [];
  for (let k = TREND_WEEKS - 1; k >= 0; k -= 1) {
    const weekEnd = addDaysISO(today, -7 * k);
    const windowStart = addDaysISO(weekEnd, -(TREND_ROLL_DAYS - 1));
    let wDone = 0;
    let wScheduled = 0;
    for (let iso = windowStart; iso <= weekEnd; iso = addDaysISO(iso, 1)) {
      if (iso > today) continue;
      const credit = creditOnDay(iso);
      if (credit === undefined) continue; // not due that day
      if (credit === null) continue; // excused
      if (iso === today && credit < 1) continue; // pending — same rule as the main sweep
      wScheduled += 1;
      wDone += credit;
    }
    trend.push({ weekEndISO: weekEnd, rate: wScheduled > 0 ? wDone / wScheduled : 0, scheduledCount: wScheduled });
  }

  return {
    scheduledDays: scheduled,
    consistency,
    byWeekday,
    bestWeekday,
    toughestWeekday,
    currentStreak,
    longestStreak,
    trend,
    weekdayApplicable,
  };
}

/**
 * Derive every per-habit stat from that habit's raw completion rows. Pure — easy to reason about
 * and test. `completions` may contain rows for other habits (the caller's window); rows whose
 * `habit_id` differs are ignored, so a filtered or unfiltered array both work.
 */
export function computeHabitStats(
  habit: ProgressHabit,
  completions: CompletionRow[],
  today: string,
  windowDays = STATS_WINDOW_DAYS,
): HabitStats {
  const credit = creditOnDay(completions);

  return statsFromDailyCredit(
    (iso) => credit(habit, iso),
    today,
    !habit.hijri_schedule,
    windowDays,
  );
}
