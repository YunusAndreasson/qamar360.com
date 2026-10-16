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

import { hasCadence, type GoalCheckIn } from '@/lib/check-ins';
import type { Tables } from '@/lib/database.types';
import { addDaysISO, createdDayISO, daysBetweenISO, hijriMonthAfter, hijriMonthRange, hijriMonthsBetween, hijriParts, scheduledOn, type HijriSchedule } from '@/lib/dates';
import type { CompletionRow, ProgressHabit } from '@/lib/progress';

/**
 * One goal, as stored — with the cadence's JSON narrowed the way `Habit` narrows
 * `hijri_schedule`. The generated row type carries it as `Json`, and every consumer in the app
 * reads it as a {@link HijriSchedule}; doing it once here means no screen has to cast.
 */
export type Goal = Omit<Tables<'goals'>, 'check_in_hijri'> & { check_in_hijri: HijriSchedule | null };

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
  /**
   * The measure so far, in the goal's own unit. Uncapped — see {@link contributedCredit}.
   *
   * Where a goal reports its own position ({@link measured}) this is that position rather than a
   * sum: 82.4 kg, page 340. It is still "how far the measure has got", which is why it is the same
   * field and not a second one.
   */
  earned: number;
  /** What is left to cover, whichever way the measure travels; 0 once the target is met. */
  remaining: number;
  /** The goal's number comes from its own readings rather than from the acts' sum. */
  measured: boolean;
  /**
   * It asks for its measure and has not been told one yet. Nothing below can be known until the
   * first reading lands, so the screen says so rather than printing a confident zero.
   */
  awaiting: boolean;
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
 * Round up to a step.
 *
 * `Math.ceil` is right for 151 lines and wrong for 1.7 kilograms, and a month's ask rounded to
 * the next whole kilogram is a different instruction from the one the arithmetic gave. The step
 * is chosen per goal from what its own numbers look like, not from its unit — a unit is free text
 * and nothing else in this app branches on it.
 *
 * The 1e-9 slack is not decoration: `1.7 / 0.1` is `17.000000000000004` in binary floating point,
 * which would round a quota of exactly 1.7 up to 1.8.
 */
function ceilTo(value: number, step: number): number {
  const steps = Math.ceil(value / step - 1e-9);
  return Math.round(steps * step * 1e6) / 1e6;
}

/**
 * Read every goal against the record.
 *
 * Takes the same arguments the rest of the derived layer does — habits, all-time completions,
 * today — because the Progress tab already fetches exactly that (`use-progress.tsx`, no window:
 * "This life" needs the whole record), so a goal spanning twenty years costs no query of its own.
 * `checkIns` rides along beside them, and is unwindowed for the same reason: the first reading a
 * goal ever took is its baseline, however long ago that was.
 */
export function computeGoals(
  goals: readonly Goal[],
  goalActs: readonly GoalAct[],
  habits: readonly EngineHabit[],
  completions: readonly CompletionRow[],
  checkIns: readonly GoalCheckIn[],
  today: string,
): GoalReading[] {
  const byHabit = new Map(habits.map((h) => [h.id, h]));
  const now = hijriParts(today);
  const month = hijriMonthRange(today);

  // Credit per habit per Hijri month, in one pass over the record. Rows for habits no goal drives
  // are dropped here rather than filtered per goal, so a long record is walked once.
  const driven = new Set(goalActs.filter((a) => a.contributes).map((a) => a.habit_id));
  const tallies = new Map<string, Map<string, number>>(); // habitId → monthKey → credit
  // The same credits again, kept by day. A goal told where it stands counts only what its acts
  // have added *since* that day, and a month bucket cannot answer that.
  const dayCredits: { habitId: string; day: string; credit: number }[] = [];
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
    dayCredits.push({ habitId: row.habit_id, day: row.completed_at, credit });
  }

  // Gregorian last days of this Hijri month and the twelve before it, newest first — the
  // boundaries a series of readings has to be sliced on. The act tallies need no such thing: they
  // are already bucketed by `monthKey`, whereas a reading is a position on a *day* and has to be
  // asked "where had this got to by then?". Built once for every goal, and every hop is served by
  // the per-day Hijri parts cache.
  const monthEnds: string[] = [];
  if (month) {
    let range = month;
    monthEnds.push(range.end);
    for (let back = 1; back <= BEST_MONTHS; back += 1) {
      const previous = hijriMonthRange(addDaysISO(range.start, -1));
      if (!previous) break;
      monthEnds.push(previous.end);
      range = previous;
    }
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
    let actTotal = 0;
    for (const a of contributors) {
      for (const credit of tallies.get(a.habit_id)?.values() ?? []) actTotal += credit;
    }

    // This goal's readings, oldest first. The first is its baseline and the last is where it
    // stands; everything between them is the line the goal screen draws.
    const readings = checkIns.filter((c) => c.goal_id === goal.id).sort((a, b) => (a.taken_on < b.taken_on ? -1 : 1));
    const latest = readings[readings.length - 1] ?? null;
    const baseline = readings[0] ?? null;
    const measured = latest !== null;
    const down = goal.direction === 'down';
    // Nothing measures it yet: it asks for its position and has not been given one, and it has no
    // act adding to it either. Distinct from a goal whose acts were all deleted, which the screen
    // already words differently.
    const awaiting = !measured && contributors.length === 0 && hasCadence(goal);

    /** Credit from this goal's contributing acts after `day` — what has been added since a reading. */
    const creditAfter = (day: string): number => {
      let total = 0;
      for (const row of dayCredits) {
        if (row.day <= day) continue;
        if (contributors.some((a) => a.habit_id === row.habitId)) total += row.credit;
      }
      return total;
    };

    /**
     * The measure at the end of `day`, from readings alone, carried forward. `null` before the
     * first one — which is the readings twin of `monthOf`'s "before this goal existed" break.
     */
    const measureAt = (day: string | undefined): number | null => {
      if (day === undefined) return null;
      let at: number | null = null;
      for (const r of readings) {
        if (r.taken_on > day) break;
        at = r.value;
      }
      return at;
    };

    /** Signed progress from one measure to another. A falling goal travels the other way. */
    const toward = (from: number, to: number): number => (down ? from - to : to - from);

    // Where the measure has got to.
    //
    // A reading is a *position*, not a gain: "I am on page 340" replaces whatever the acts had
    // summed to, and only what they have added since counts on top of it. That is what makes a
    // check-in a repair of the drift `contributedCredit`'s `?? target_count` fallback already
    // admits to, rather than a second, competing ledger.
    //
    // A falling measure takes no act credit at all. An act adds; nothing you tick subtracts, so a
    // weight is whatever the scale last said and the composer offers such a goal no contributors.
    const earned = !measured ? actTotal : down ? latest.value : latest.value + creditAfter(latest.taken_on);
    const remaining = down ? Math.max(0, earned - goal.target_value) : Math.max(0, goal.target_value - earned);
    const met = !awaiting && remaining === 0;

    // The goal's own first month: months before it belong to a past this goal never asked for,
    // and averaging them in would report a pace of nothing for a goal set last week.
    const startISO = goal.created_at ? createdDayISO(goal.created_at) : null;
    const startParts = startISO ? hijriParts(startISO) : null;

    const monthOf = (delta: number): number | null => {
      if (!now) return null;
      // A measured goal is sliced on the calendar rather than bucketed: how far the position moved
      // between the end of the month before and the end of this one. The current month reads
      // `earned` instead of the month's last day, so credit added today counts.
      if (measured) {
        const back = -delta;
        const from = measureAt(monthEnds[back + 1]);
        if (from === null) return null; // before the first reading — nothing to compare against
        const to = back === 0 ? earned : (measureAt(monthEnds[back]) ?? from);
        return toward(from, to);
      }
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
    //
    // Rounded to a step the goal's own numbers justify: whole where its target and every reading
    // are whole (lines, words, pages), a tenth where they are not (kilograms). Rounding 1.7 kg up
    // to 2 is a different instruction from the one the division gave.
    const roundStep = Number.isInteger(goal.target_value) && readings.every((r) => Number.isInteger(r.value)) ? 1 : 0.1;
    const quota = met || awaiting ? null : ceilTo((remaining + earnedThisMonth) / monthsToSpread, roundStep);
    const quotaRemaining = quota === null ? 0 : Math.max(0, ceilTo(quota - earnedThisMonth, roundStep));

    // One contributor only — see the field note on `dailyTarget`.
    let dailyTarget: number | null = null;
    // Never for a falling measure: there is no act to hand a per-day target to, and `9 kg a day`
    // would be the app's one genuinely absurd sentence.
    if (quota !== null && !down && contributors.length === 1 && month) {
      const habit = byHabit.get(contributors[0]!.habit_id);
      if (habit) {
        const days = scheduledDaysBetween(habit, today, month.end);
        if (days > 0 && quotaRemaining > 0) dailyTarget = Math.ceil(quotaRemaining / days);
      }
    }

    const monthsAtPace = pace !== null && pace > 0 ? Math.ceil(remaining / pace) : null;
    const arrival = met || monthsAtPace === null ? null : hijriMonthAfter(today, monthsAtPace);

    // Steps are counted on the ground actually covered, which for a summed goal is `earned` itself
    // and for a measured one is the distance from its first reading. A weight starting at 85 and
    // aiming at 75 in steps of two has passed one mark at 83, and its next is at 81 — a *measure*,
    // like every other number the screen prints, not a count of steps dressed up as one.
    const stepSize = goal.milestone_step;
    const milestones: GoalMilestones | null =
      stepSize && stepSize > 0 && !awaiting
        ? (() => {
            if (!measured || !baseline) {
              const reached = Math.floor(earned / stepSize);
              const next = (reached + 1) * stepSize;
              return { step: stepSize, reached, next: next <= goal.target_value ? next : null };
            }
            const covered = Math.max(0, toward(baseline.value, earned));
            const whole = Math.abs(goal.target_value - baseline.value);
            const reached = Math.floor(covered / stepSize);
            const nextCovered = (reached + 1) * stepSize;
            const next =
              nextCovered <= whole
                ? Math.round((down ? baseline.value - nextCovered : baseline.value + nextCovered) * 1e6) / 1e6
                : null;
            return { step: stepSize, reached, next };
          })()
        : null;

    return {
      goal,
      acts: engine,
      earned,
      remaining,
      measured,
      awaiting,
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
  // Step month by month: the run is short (239 months for the longest span offered) and every
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
  const { goal, quota, quotaRemaining, remaining, met, overdue, measured, awaiting, earned } = reading;
  if (goal.status === 'reached' || met) return 'Reached';
  if (goal.status === 'released') return 'Set aside';
  // It asks where you are and has not been told yet. Every other line here would be a guess.
  if (awaiting) return 'Not measured yet';
  const monthName = hijriParts(today)?.monthName;
  // A goal that reports its position leads with the position, because that is the thing that
  // moved. A summed one leads with the month's ask, because a sum only ever creeps. The unit is
  // said once: "82.4 kg, 7.4 to go" needs no second "kg" to be read correctly.
  if (measured) {
    const here = `${formatMeasure(earned)} ${goal.unit}`;
    if (overdue) return `${here}, past its horizon`;
    if (!monthName || quota === null) return `${here}, ${formatMeasure(remaining)} to go`;
    if (quotaRemaining === 0) return `${here} · ${monthName} target reached`;
    return `${here} · ${formatMeasure(quotaRemaining)} left in ${monthName}`;
  }
  // No Islamic calendar on this runtime: there are no lunar months to divide by, so the row says
  // the one thing that is still true.
  if (!monthName || quota === null) return `${formatMeasure(remaining)} ${goal.unit} to go`;
  if (overdue) return `Past its horizon · ${formatMeasure(remaining)} ${goal.unit} to go`;
  if (quotaRemaining === 0) return `${monthName} target reached`;
  return `${formatMeasure(quotaRemaining)} ${goal.unit} left in ${monthName}`;
}

/**
 * A goal's readings as a line: one point per day it was answered, oldest first.
 *
 * Only the readings — no carrying forward, no interpolation onto days that were never answered.
 * A check-in is a measurement, and a chart that invents the days between two of them is drawing
 * something nobody observed.
 */
export function goalSeries(goalId: string, checkIns: readonly GoalCheckIn[]): { day: string; value: number }[] {
  return checkIns
    .filter((c) => c.goal_id === goalId)
    .sort((a, b) => (a.taken_on < b.taken_on ? -1 : 1))
    .map((c) => ({ day: c.taken_on, value: c.value }));
}

/** A goal's readings, ready to draw: each point 0–1 left to right by date, 0–1 bottom to top by
 *  value, against a scale that always contains the target. */
export type GoalPlot = {
  points: { day: string; value: number; span: number; fraction: number }[];
  /** Where the target's rule sits on the same 0–1 vertical scale. */
  targetFraction: number;
  /** The value at the bottom and top of the plot, for the axis labels. */
  low: number;
  high: number;
};

/** How much of the plot is breathing room above the highest reading and below the lowest. */
const PLOT_PAD = 0.08;

/**
 * Place a goal's readings on a plot.
 *
 * Two decisions worth stating.
 *
 * **The x axis is time, not the reading's turn in the queue.** Check-ins are irregular by nature —
 * a weekly one answered on the Thursday, a monthly one three days late — and spacing them evenly
 * would draw a steady descent through readings that were actually two months apart. The line has
 * to be readable as a rate or it is decoration.
 *
 * **The target is inside the range, always.** A weight chart whose scale ran only over the
 * readings would put the goal off the top or bottom of its own picture, and the distance still to
 * go is the one thing the picture is for.
 *
 * `null` below two readings: a line through one point says nothing, and a flat line pinned to the
 * floor reads as a chart that failed to draw — the same call {@link
 * import('@/components/habit-trend-chart').HabitTrendChart} makes about an empty week.
 */
export function goalPlot(series: readonly { day: string; value: number }[], target: number): GoalPlot | null {
  if (series.length < 2) return null;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const days = daysBetweenISO(first.day, last.day);

  const values = series.map((p) => p.value);
  const rawLow = Math.min(target, ...values);
  const rawHigh = Math.max(target, ...values);
  // A goal already sitting exactly on its target has no spread to scale against; give it one so
  // the line lands mid-plot rather than dividing by zero.
  const spread = rawHigh - rawLow || Math.max(1, Math.abs(rawHigh) * 0.1);
  const low = rawLow - spread * PLOT_PAD;
  const high = rawHigh + spread * PLOT_PAD;
  const fraction = (value: number) => (value - low) / (high - low);

  return {
    points: series.map((p) => ({
      ...p,
      // All readings on one day (or one day's worth apart) fall back to even spacing, which is
      // what `spanFor` would have given them anyway.
      span: days > 0 ? daysBetweenISO(first.day, p.day) / days : 0.5,
      fraction: fraction(p.value),
    })),
    targetFraction: fraction(target),
    low,
    high,
  };
}
