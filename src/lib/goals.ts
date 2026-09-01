/**
 * Goals — a horizon placed over acts you already keep.
 *
 * Everything here is derived. A goal row stores a target, a by-when and which acts drive it;
 * this module turns that into the four figures a goal is actually read by — what it has earned,
 * what this lunar month is asking for, how fast it is really moving, and the month it arrives at
 * that speed — from `habit_completions`, the rows the daily tick already writes.
 *
 * That is not an optimisation, it is the feature. Bandura & Schunk (1981) found distal goals had
 * no demonstrable effect where proximal subgoals produced mastery, and Harkin et al. (2016) found
 * the effect of progress monitoring runs through how *often* you monitor. So the goal must reduce
 * to a number on today's act, and it must ride on a gesture already made daily rather than adding
 * one. Both requirements point at the same design: no logging of its own, and a quota that
 * divides down to a per-day target.
 *
 * The month is the unit throughout, never the day. Beshears et al. (*Management Science*, 2021)
 * paid people to exercise inside a fixed daily window against paying them for any day at all, and
 * the fixed-window group made *fewer* visits — during the intervention and after it ended. A
 * quota you can settle on Thursday because Tuesday got away from you is the version that
 * survives, and it is also the unit the rest of this app already counts in.
 *
 * Pure, and tested in `goals.test.ts` — jest here matches `src/**\/*.test.ts` only, so this
 * arithmetic inside a screen would have no test at all.
 */

import type { Tables } from '@/lib/database.types';
import { addDaysISO, createdDayISO, hijriMonthAfter, hijriMonthRange, hijriMonthsBetween, hijriParts, scheduledOn } from '@/lib/dates';
import type { CompletionRow, ProgressHabit } from '@/lib/progress';

/** One goal, as stored. */
export type Goal = Tables<'goals'>;

/** Which acts drive a goal, and which of them move its number. */
export type GoalAct = Tables<'goal_acts'>;

/** The habit shape this module reads: {@link ProgressHabit} plus the unit a count wears, so one
 *  habit shape serves the progress sweep, the readings and the goals. `Habit` satisfies it. */
type EngineHabit = ProgressHabit & { target_unit?: string | null };

/** How many closed Hijri months the pace is averaged over. Three is enough to take the noise out
 *  of a single bad month and short enough that a change of gear shows up inside a season — the
 *  same trade {@link import('./progress').MonthProgress.averageRate} makes at twelve, one scale
 *  down, because a goal is read for where it is going rather than for what is usual. */
const PACE_MONTHS = 3;

/** How far back the best month is looked for. A Hijri year, matching every other walk in the app. */
const BEST_MONTHS = 12;

/**
 * How far above your best month a quota may sit before the goal is called out of reach.
 *
 * A quarter more than your best month ever is a stretch; double it is a fantasy, and a fantasy
 * printed as a monthly target does real harm — goal-setting theory is explicit that commitment
 * depends on believing the thing attainable, so an impossible quota does not merely fail to
 * motivate, it takes the belief down with it. Past this line the goal stops asking and says the
 * horizon is wrong, which is the one repair that is both honest and usable.
 */
const STRAIN_LIMIT = 1.25;

/** One act driving a goal, as the goal screen lists it. */
type GoalEngineAct = {
  habitId: string;
  name: string;
  /** Whether it moves the measure. False for revision — see the migration's note on ḥifẓ. */
  contributes: boolean;
  /** Its current per-day target, or `null` for a binary act. */
  targetCount: number | null;
};

/** Where a goal has got to against its own steps: three juzʾ behind you, the fourth ahead. */
type GoalMilestones = {
  step: number;
  /** Whole steps completed. */
  reached: number;
  /** The measure the next step sits at, or `null` once the target itself is the next mark. */
  next: number | null;
};

/** A goal, read. Every field here is derived; nothing in it is stored. */
export type GoalReading = {
  goal: Goal;
  /** The engine, in the order the acts were attached. Empty when every act has been deleted. */
  acts: GoalEngineAct[];
  /** The measure so far, in the goal's own unit. Uncapped — see {@link contributedCredit}. */
  earned: number;
  /** What is left of the target; 0 once it is met. */
  remaining: number;
  /** Whole lunar months from this one to the horizon's, inclusive of both. 0 when the horizon
   *  has already passed — there is no negative amount of time to plan over. */
  monthsLeft: number;
  /** True when the horizon is behind us: the goal is still open but its by-when has gone. */
  overdue: boolean;
  /**
   * What this lunar month is asking for, in the goal's unit — fixed at the month's start so it
   * can actually be finished, and `null` once the goal is met. Recomputed at each new moon from
   * what really happened: ahead of yourself and it eases, behind and it rises. It re-plans; it
   * does not accuse.
   */
  quota: number | null;
  /** What is left of {@link quota} after this month's earnings — 0 once the month is settled. */
  quotaRemaining: number;
  /**
   * The per-day figure to offer the engine act's `target_count`: what remains of this month's
   * quota spread over the act's *remaining scheduled days*, today included.
   *
   * Read off the remainder rather than the whole month so that opening the goal on the 20th
   * shows a number that is true on the 20th. At the new moon — the moment it is actually offered
   * — the remainder is the whole month, so the notification and this agree.
   *
   * `null` unless exactly one act contributes: with two, splitting the quota between them would
   * be a guess about which one you meant to do more of, and a guess is worse than a blank.
   */
  dailyTarget: number | null;
  /**
   * Mean earned over the last closed Hijri months. `0` and `null` are different answers and the
   * screen reads them differently: `0` means closed months exist and nothing was done in them,
   * `null` that the goal is younger than its first closed month and has not yet earned an
   * opinion about itself.
   */
  pace: number | null;
  /** The Hijri month the goal arrives in at {@link pace}, or `null` when it isn't moving. */
  arrival: { monthName: string; year: number } | null;
  /** The horizon as it is always shown: a Hijri month and year. */
  horizon: { monthName: string; year: number } | null;
  /**
   * Whether the quota is within reach of your best month. `true` while there is no closed month
   * to judge against — a goal one week old has not yet earned an opinion about itself.
   */
  reachable: boolean;
  /** Where the goal has got to against its own steps, or `null` when it has none. */
  milestones: GoalMilestones | null;
  /** The target is met. Never written back automatically; the screen offers to close it. */
  met: boolean;
};

/**
 * One completion row's contribution, in the goal's unit.
 *
 * **Uncapped, and deliberately unlike {@link import('./progress').creditFor}.** That function
 * answers "how much of today's act was done", so it clamps at 1 — a day cannot be more than
 * finished, and a month cannot pass 100%. This one answers "how many lines were memorised", and
 * eight lines on a four-line day really is eight lines. The two questions have different answers
 * on the same row, which is exactly why the goal does not reuse the rate.
 *
 * The `?? target_count` fallback covers rows written as a plain 'done' with no count: everything
 * before this feature existed, and the optimistic rows {@link import('./progress').withDoneToday}
 * injects. It reads the habit's *current* target, so a target that has since changed dates the
 * old row wrongly — best effort, and the reason the seal writes the count explicitly.
 */
function contributedCredit(row: CompletionRow, habit: EngineHabit): number {
  if (row.status === 'skipped') return 0; // excused: not a miss, but not a line memorised either
  if (row.count != null) return row.count;
  return row.status === 'done' ? (habit.target_count ?? 0) : 0;
}

/** A Hijri month as a sortable key, so a month's tally needs no date range to find. */
function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The Hijri month `delta` months from (`year`, `month`). Twelve to the year, always. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = month - 1 + delta;
  return { year: year + Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
}

/**
 * The act's scheduled days from `fromISO` to `toISO` inclusive — the denominator the quota is
 * spread over. Uses {@link scheduledOn}, so a goal counts the same days the month's rate does and
 * a Mon/Thu act is never asked for a Wednesday's worth.
 */
function scheduledDaysBetween(habit: EngineHabit, fromISO: string, toISO: string): number {
  let days = 0;
  for (let iso = fromISO; iso <= toISO; iso = addDaysISO(iso, 1)) {
    if (scheduledOn(habit, iso)) days += 1;
  }
  return days;
}

/**
 * Read every goal against the record.
 *
 * Takes the same three arguments the rest of the derived layer does — habits, all-time
 * completions, today — because the Progress tab already fetches exactly that
 * (`use-progress.tsx`, no window: "This life" needs the whole record), so a goal spanning twenty
 * years costs no query of its own.
 */
export function computeGoals(
  goals: readonly Goal[],
  goalActs: readonly GoalAct[],
  habits: readonly EngineHabit[],
  completions: readonly CompletionRow[],
  today: string,
): GoalReading[] {
  const byHabit = new Map(habits.map((h) => [h.id, h]));
  const now = hijriParts(today);
  const month = hijriMonthRange(today);

  // Credit per habit per Hijri month, in one pass over the record. Rows for habits no goal drives
  // are dropped here rather than filtered per goal, so a long record is walked once.
  const driven = new Set(goalActs.filter((a) => a.contributes).map((a) => a.habit_id));
  const tallies = new Map<string, Map<string, number>>(); // habitId → monthKey → credit
  for (const row of completions) {
    if (!driven.has(row.habit_id)) continue;
    const habit = byHabit.get(row.habit_id);
    if (!habit) continue;
    const parts = hijriParts(row.completed_at);
    if (!parts) continue;
    const credit = contributedCredit(row, habit);
    if (credit === 0) continue;
    let months = tallies.get(row.habit_id);
    if (!months) {
      months = new Map();
      tallies.set(row.habit_id, months);
    }
    const key = monthKey(parts.year, parts.month);
    months.set(key, (months.get(key) ?? 0) + credit);
  }

  return goals.map((goal) => {
    const acts = goalActs.filter((a) => a.goal_id === goal.id);
    const engine: GoalEngineAct[] = acts.flatMap((a) => {
      const habit = byHabit.get(a.habit_id);
      // A habit deleted since is already gone from `goal_acts` by cascade; this covers the window
      // where the goals query has landed and the habits one has not.
      if (!habit) return [];
      return [{ habitId: a.habit_id, name: habit.name ?? '', contributes: a.contributes, targetCount: habit.target_count ?? null }];
    });
    const contributors = acts.filter((a) => a.contributes);

    // Sum every month of every contributing act.
    let earned = 0;
    for (const a of contributors) {
      for (const credit of tallies.get(a.habit_id)?.values() ?? []) earned += credit;
    }
    const remaining = Math.max(0, goal.target_value - earned);
    const met = remaining === 0;

    // The goal's own first month: months before it belong to a past this goal never asked for,
    // and averaging them in would report a pace of nothing for a goal set last week.
    const startISO = goal.created_at ? createdDayISO(goal.created_at) : null;
    const startParts = startISO ? hijriParts(startISO) : null;

    const monthOf = (delta: number): number | null => {
      if (!now) return null;
      const at = shiftMonth(now.year, now.month, delta);
      if (startParts && monthKey(at.year, at.month) < monthKey(startParts.year, startParts.month)) return null;
      const key = monthKey(at.year, at.month);
      let total = 0;
      for (const a of contributors) total += tallies.get(a.habit_id)?.get(key) ?? 0;
      return total;
    };

    const earnedThisMonth = monthOf(0) ?? 0;
    const closed: number[] = [];
    for (let back = 1; back <= BEST_MONTHS; back += 1) {
      const total = monthOf(-back);
      if (total === null) break; // reached the month the goal was set in; nothing before it counts
      closed.push(total);
    }
    const paceMonths = closed.slice(0, PACE_MONTHS);
    const pace = paceMonths.length > 0 ? paceMonths.reduce((sum, m) => sum + m, 0) / paceMonths.length : null;
    const best = closed.length > 0 ? Math.max(...closed) : null;

    // Inclusive of this month and the horizon's: "by Ramaḍān" means you have Ramaḍān to do it in,
    // which is what the composer's month picker says out loud.
    const gap = hijriMonthsBetween(today, goal.horizon_on);
    const overdue = gap !== null && gap < 0;
    const monthsLeft = gap === null || gap < 0 ? 0 : gap;
    const monthsToSpread = monthsLeft + 1;

    // Fixed at the month's start — `remaining` already has this month's earnings out of it, so
    // they go back in before the division. Dividing the live remainder instead would recompute
    // the month's ask every time you worked, and a target that retreats as you approach it can
    // never be *attained*: attainment is the whole mechanism a subgoal works by, so a quota you
    // cannot finish is not a smaller version of one you can.
    const quota = met ? null : Math.ceil((remaining + earnedThisMonth) / monthsToSpread);
    const quotaRemaining = quota === null ? 0 : Math.max(0, quota - earnedThisMonth);

    // One contributor only — see the field note on `dailyTarget`.
    let dailyTarget: number | null = null;
    if (quota !== null && contributors.length === 1 && month) {
      const habit = byHabit.get(contributors[0]!.habit_id);
      if (habit) {
        const days = scheduledDaysBetween(habit, today, month.end);
        if (days > 0 && quotaRemaining > 0) dailyTarget = Math.ceil(quotaRemaining / days);
      }
    }

    const monthsAtPace = pace !== null && pace > 0 ? Math.ceil(remaining / pace) : null;
    const arrival = met || monthsAtPace === null ? null : hijriMonthAfter(today, monthsAtPace);

    const step = goal.milestone_step;
    const milestones: GoalMilestones | null =
      step && step > 0
        ? (() => {
            const reached = Math.floor(earned / step);
            const next = (reached + 1) * step;
            return { step, reached, next: next <= goal.target_value ? next : null };
          })()
        : null;

    return {
      goal,
      acts: engine,
      earned,
      remaining,
      monthsLeft,
      overdue,
      quota,
      quotaRemaining,
      dailyTarget,
      pace,
      arrival,
      horizon: hijriParts(goal.horizon_on),
      // No closed month to judge against is not evidence of anything, so it reads as reachable.
      reachable: quota === null || best === null || best === 0 ? true : quota / best <= STRAIN_LIMIT,
      milestones,
      met,
    };
  });
}

/**
 * The last day of the Hijri month `months` after this one — what the composer's spans store.
 *
 * The horizon is stored as a date because Postgres has one calendar, but it is *chosen* as a
 * lunar span ("in five years") and *shown* as a Hijri month. Storing the month's last day rather
 * than its first is what makes "by Ramaḍān 1450" mean you have Ramaḍān to work in, which is the
 * reading anyone would give it.
 *
 * `null` where the Islamic calendar is unavailable — the composer hides the span control there
 * rather than quietly storing a Gregorian guess.
 */
export function horizonFromLunarMonths(today: string, months: number): string | null {
  const start = hijriMonthRange(today);
  if (!start) return null;
  // Step month by month: the run is short (240 months for the longest span offered) and every
  // hop is served by the per-day parts cache.
  let range = start;
  for (let i = 0; i < months; i += 1) {
    const next = hijriMonthRange(addDaysISO(range.end, 1));
    if (!next) return null;
    range = next;
  }
  return range.end;
}

/**
 * A measure, printed. Thousands separated, because the numbers here are large enough to be
 * misread without it (9,060 lines), and at most one decimal, because a goal counted in pages can
 * legitimately move half a step and nothing in this app wants three.
 */
export function formatMeasure(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/**
 * The second line of a goal's row — what has changed, not what the goal is.
 *
 * The month's ask leads, because it is the only line here that is about today. The arrival month
 * and the pace are on the goal's own screen: they are what you go and look at, not what you need
 * to be told in a list. Whatever the state, this says something true and never says it in the
 * negative — there is no "behind", no "%", and no counterpart to the sentence a good month gets.
 */
export function goalMeta(reading: GoalReading, today: string): string {
  const { goal, quota, quotaRemaining, remaining, met, overdue } = reading;
  if (goal.status === 'reached' || met) return 'Reached';
  if (goal.status === 'released') return 'Set aside';
  const monthName = hijriParts(today)?.monthName;
  // No Islamic calendar on this runtime: there are no lunar months to divide by, so the row says
  // the one thing that is still true.
  if (!monthName || quota === null) return `${formatMeasure(remaining)} ${goal.unit} to go`;
  if (overdue) return `The horizon has passed · ${formatMeasure(remaining)} ${goal.unit} to go`;
  if (quotaRemaining === 0) return `${monthName} settled`;
  return `${monthName} asks ${formatMeasure(quotaRemaining)} ${goal.unit}`;
}
