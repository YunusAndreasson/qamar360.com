/**
 * Check-ins — a goal asking where you are.
 *
 * A goal was built to own no measurements: its figures are summed from `habit_completions`,
 * the rows the daily tick already writes ({@link import('./goals')}). That works when an act
 * produces the measure — four lines memorised is four lines — and cannot work at all when none
 * does. Nothing you tick moves a weight, and `computeGoals` only ever adds.
 *
 * So a goal may also *ask*. On a cadence of its own it puts one row on the day: report where you
 * are. The answer is a position, not an increment — "I am on page 340", "82.4 kg" — and it becomes
 * the goal's current measure.
 *
 * This module owns only **when the asking happens** and **what the row says**; what the answer
 * does to the measure lives in `goals.ts`, which imports this one. The dependency runs one way on
 * purpose: `insights.ts` and `progress.ts` had to be untangled once already, and a cycle through
 * the module every screen derives from is the expensive kind.
 *
 * Pure, and tested in `check-ins.test.ts` — jest here matches `src/**\/*.test.ts` only, so a
 * visibility matrix living inside a component would have no test at all (the same reason
 * {@link import('./tasks').taskRowContract} sits outside `TaskRow`).
 */

import type { Tables } from '@/lib/database.types';
import {
  DAILY_SCHEDULE,
  addDaysISO,
  dayTitle,
  describeHijriSchedule,
  describeWeekdays,
  scheduledOn,
  WEEKDAY_NAMES,
  type HijriSchedule,
} from '@/lib/dates';
import { MILESTONE_DAYS } from '@/lib/lunar-phase';

/** One answered check-in: where a goal stood on a day, in its own unit. */
export type GoalCheckIn = Tables<'goal_check_ins'>;

/**
 * The cadence fields the day rules read. A `Goal` satisfies this structurally, so nothing here
 * needs the whole row — which is also what lets the tests state a cadence in three fields.
 */
export type Cadenced = {
  check_in_days: number[];
  check_in_hijri: HijriSchedule | null;
  check_in_from: string | null;
};

/**
 * How far back an unanswered ask is looked for.
 *
 * Forty days: a thirty-day Hijri month plus slack, so the monthly cadence — the widest one
 * offered — always finds its occurrence. Past this the ask is let go rather than accumulated.
 * That is the same refusal the rest of the app makes about a miss: there is no backlog anywhere
 * in it, and a column of eleven unanswered weigh-ins would be the first.
 */
export const LOOKBACK_DAYS = 40;

/** The four cadences offered, and the schedule each one stores. */
export type CadenceKey = 'daily' | 'weekly' | 'quarter' | 'month';

/**
 * One table, read by the picker, by the writer and by {@link describeCadence} — so a cadence
 * cannot be stored in one shape and read back in another.
 *
 * Every one of them is expressed in the two columns `scheduledOn` already understands, which is
 * the whole reason a check-in needed no recurrence engine of its own: `check_in_days` is the
 * weekday set habits use, `check_in_hijri` the {@link HijriSchedule} they use for the White Days
 * and Ramaḍān. The moon quarter reuses {@link MILESTONE_DAYS} rather than restating `[1,8,15,22]`,
 * so the ask lands on the same grid the quarterly readings publish on and cannot drift from it.
 */
export const CADENCES: {
  key: CadenceKey;
  label: string;
  /** What it stores. `weekly` is filled in with the chosen weekday; its `days` here is the default. */
  days: number[];
  hijri: HijriSchedule | null;
}[] = [
  { key: 'daily', label: 'Every day', days: DAILY_SCHEDULE, hijri: null },
  { key: 'weekly', label: 'Once a week', days: [1], hijri: null },
  { key: 'quarter', label: 'Each moon quarter', days: [], hijri: { monthDays: [...MILESTONE_DAYS] } },
  { key: 'month', label: 'Each Hijri month', days: [], hijri: { monthDays: [1] } },
];

/** The cadence fields for a key (and, for `weekly`, the weekday chosen), ready to store. */
export function cadenceFields(
  key: CadenceKey,
  weekday: number,
  from: string,
): Pick<Cadenced, 'check_in_days' | 'check_in_hijri' | 'check_in_from'> {
  const cadence = CADENCES.find((c) => c.key === key);
  if (!cadence) return { check_in_days: [], check_in_hijri: null, check_in_from: null };
  return {
    check_in_days: key === 'weekly' ? [weekday] : cadence.days,
    check_in_hijri: cadence.hijri,
    check_in_from: from,
  };
}

/** Which cadence a stored goal is on, or `null` for one that asks nothing. */
export function cadenceOf(goal: Cadenced): CadenceKey | null {
  if (!hasCadence(goal)) return null;
  const hijri = goal.check_in_hijri;
  if (hijri) {
    const days = hijri.monthDays ?? [];
    if (days.length === 1 && days[0] === 1) return 'month';
    if (days.length === MILESTONE_DAYS.length && MILESTONE_DAYS.every((d) => days.includes(d))) return 'quarter';
    return null; // a Hijri shape no preset covers — `describeCadence` still names it
  }
  return goal.check_in_days.length === 7 ? 'daily' : 'weekly';
}

/**
 * The goals that are allowed to ask — the live ones.
 *
 * A cadence says *when* a goal asks; the status says *whether* it still does. Both `showsOn` and
 * `openCountOn` work off {@link Cadenced}, which has no status column in it, so every caller owes
 * them this filter — and every caller was skipping it. A goal you had set aside went on putting an
 * open row on Today under a screen that promised "stops the monthly ask", while the goals list
 * (which DID filter) had already dropped it — so the ask was unanswerable from anywhere, and it
 * held the day's close back through `openCountOn`.
 *
 * Stated once, here, rather than re-spelled at four call sites: a fifth would have got it wrong.
 * `reached` is excluded with `released` for the same reason — a goal you have finished is not
 * waiting to hear where it stands.
 */
export function askingGoals<G extends { status: string }>(goals: readonly G[]): G[] {
  return goals.filter((goal) => goal.status === 'open');
}

/** Does this goal ask at all? */
export function hasCadence(goal: Cadenced): boolean {
  return goal.check_in_from !== null && (goal.check_in_days.length > 0 || goal.check_in_hijri !== null);
}

/**
 * A cadence in words: "Every day", "Every Monday", "Each moon quarter", "Each Hijri month".
 *
 * Falls through to the schedule describers habits already use, so a cadence stored by some future
 * surface — several weekdays, the White Days — still reads as something rather than as a blank.
 */
export function describeCadence(goal: Cadenced, weekStart = 0): string {
  if (!hasCadence(goal)) return 'Not asking';
  switch (cadenceOf(goal)) {
    case 'daily':
      return 'Every day';
    case 'weekly': {
      const day = goal.check_in_days[0];
      return day === undefined ? 'Once a week' : `Every ${WEEKDAY_NAMES[day]}`;
    }
    case 'quarter':
      return 'Each moon quarter';
    case 'month':
      return 'Each Hijri month';
    default:
      return goal.check_in_hijri
        ? describeHijriSchedule(goal.check_in_hijri)
        : describeWeekdays(goal.check_in_days, weekStart);
  }
}

/**
 * Does the goal ask on `day`?
 *
 * `check_in_from` is compared as a string rather than handed to `scheduledOn` as a `created_at`:
 * that function runs the timestamp through `new Date(...)`, and `new Date('2026-09-02')` parses
 * as **UTC** midnight — one local day early anywhere west of Greenwich. The date column is
 * already a `YYYY-MM-DD`, and those compare correctly with `<`.
 */
export function dueOnDay(goal: Cadenced, day: string): boolean {
  if (!hasCadence(goal) || goal.check_in_from === null || day < goal.check_in_from) return false;
  return scheduledOn(
    { created_at: null, schedule_days: goal.check_in_days, hijri_schedule: goal.check_in_hijri },
    day,
  );
}

/** The reading for `goalId` on `day`, if it was answered then. */
export function answeredOn(checkIns: readonly GoalCheckIn[], goalId: string, day: string): GoalCheckIn | null {
  return checkIns.find((c) => c.goal_id === goalId && c.taken_on === day) ?? null;
}

/** Was this goal answered on `day` or on any day after it (up to and including `until`)? */
function answeredSince(checkIns: readonly GoalCheckIn[], goalId: string, day: string, until: string): boolean {
  return checkIns.some((c) => c.goal_id === goalId && c.taken_on >= day && c.taken_on <= until);
}

/**
 * The day of the ask still waiting on `day`, or `null` when none is.
 *
 * The latest scheduled day at or before `day` that has had no answer since. **At most one**, and
 * that is the load-bearing property: a daily cadence left alone for a week must put one row on
 * today, not seven. A naïve carry-forward — every unanswered occurrence follows you, the way an
 * unfinished to-do does — is correct for a thing that happens once and nonsense for a thing that
 * repeats, because the occurrences pile up faster than anyone answers them.
 *
 * The older ones are simply let go. What is being asked for is a reading of where you are now,
 * and last Tuesday's is not recoverable on Friday anyway.
 */
export function openSince(goal: Cadenced & { id: string }, checkIns: readonly GoalCheckIn[], day: string): string | null {
  if (!hasCadence(goal)) return null;
  for (let back = 0; back <= LOOKBACK_DAYS; back += 1) {
    const at = back === 0 ? day : addDaysISO(day, -back);
    if (goal.check_in_from !== null && at < goal.check_in_from) return null; // ran past the start
    if (!dueOnDay(goal, at)) continue;
    return answeredSince(checkIns, goal.id, at, day) ? null : at;
  }
  return null;
}

/**
 * Does this goal's check-in belong on the day being viewed?
 *
 * The same three ways in {@link import('./tasks').showsOn} has, for the same reasons:
 * 1. it was **answered** on that day, so a day you step back to shows what actually happened;
 * 2. it was **asked and unanswered** on that day — its own occurrence;
 * 3. it is **still waiting** and the day in question is today — the carry-forward, which is what
 *    "it does not disappear until I check in" means.
 *
 * An answered check-in therefore greys where it stands and leaves when the day turns over. It must
 * not vanish on the tap: the row would go out from under the finger that answered it, taking the
 * correction you might want a second later with it.
 */
export function showsOn(
  goal: Cadenced & { id: string },
  checkIns: readonly GoalCheckIn[],
  day: string,
  today: string,
): boolean {
  if (!hasCadence(goal)) return false;
  if (answeredOn(checkIns, goal.id, day)) return true;
  if (dueOnDay(goal, day) && !answeredSince(checkIns, goal.id, day, today)) return true;
  return day === today && openSince(goal, checkIns, today) !== null;
}

/** A goal with a check-in on the viewed day, and the state that check-in is in. */
export type CheckInEntry<G extends Cadenced & { id: string }> = {
  goal: G;
  /** The reading given on the viewed day, or `null` while it is still being asked for. */
  answer: GoalCheckIn | null;
  /** The day the unanswered ask belongs to, or `null` once answered. */
  since: string | null;
  /** The most recent reading before the viewed day — what the sheet opens prefilled with. */
  previous: GoalCheckIn | null;
};

/**
 * The viewed day's check-ins, in the goals' own order.
 *
 * Ordered by `position` and nothing else, for the reason a ticked to-do does not sink: a row that
 * moves when you touch it takes its own undo with it.
 */
export function visibleCheckIns<G extends Cadenced & { id: string; position: number }>(
  goals: readonly G[],
  checkIns: readonly GoalCheckIn[],
  day: string,
  today: string,
): CheckInEntry<G>[] {
  return goals
    .filter((goal) => showsOn(goal, checkIns, day, today))
    .sort((a, b) => a.position - b.position)
    .map((goal) => ({
      goal,
      answer: answeredOn(checkIns, goal.id, day),
      since: openSince(goal, checkIns, day),
      previous: latestBefore(checkIns, goal.id, day),
    }));
}

/** The most recent reading strictly before `day` — the figure a new one starts from. */
export function latestBefore(checkIns: readonly GoalCheckIn[], goalId: string, day: string): GoalCheckIn | null {
  let best: GoalCheckIn | null = null;
  for (const c of checkIns) {
    if (c.goal_id !== goalId || c.taken_on >= day) continue;
    if (!best || c.taken_on > best.taken_on) best = c;
  }
  return best;
}

/** How many check-ins are still waiting on `day` — what holds the day's close back. */
export function openCountOn<G extends Cadenced & { id: string }>(
  goals: readonly G[],
  checkIns: readonly GoalCheckIn[],
  day: string,
  today: string,
): number {
  return goals.filter((goal) => showsOn(goal, checkIns, day, today) && !answeredOn(checkIns, goal.id, day)).length;
}

export type CheckInRowContract = {
  /** `'open'` — the tap asks for a number; `'answered'` — the tap corrects the one given. */
  mode: 'open' | 'answered';
  /**
   * A button, not a checkbox — the one place this row parts company with a to-do's. There is
   * nothing to toggle: the tap raises a field, and announcing a checkbox would promise a gesture
   * that does not exist here.
   */
  role: 'button';
  title: string;
  /** The spoken form — the whole row as one sentence. */
  label: string;
  hint: string;
  /** The second line, or `null` for no second line at all. */
  meta: string | null;
};

/**
 * Everything the row paints, resolved once and tested here rather than in the component.
 *
 * The second line answers whichever question is live. Waiting since an earlier day, it names that
 * day — the way a carried-forward to-do does, and with the same absence of "overdue", of red, and
 * of any count of days missed. Waiting since today, it offers the last reading instead, which is
 * the figure you are about to edit. Answered, it is the reading just given.
 */
export function checkInRowContract({
  title,
  unit,
  today,
  since,
  answer,
  previous,
}: {
  title: string;
  unit: string;
  today: string;
  since: string | null;
  answer: { value: number } | null;
  previous: { value: number; taken_on: string } | null;
}): CheckInRowContract {
  const say = (value: number) => `${formatReading(value)} ${unit}`;
  if (answer) {
    return {
      mode: 'answered',
      role: 'button',
      title,
      // No ", answered" appended — the figure being there is what says so.
      label: `${title}, ${say(answer.value)}`,
      hint: 'Corrects the reading.',
      meta: say(answer.value),
    };
  }
  const carried = since !== null && since < today ? dayTitle(since, today, { weekday: 'long' }) : null;
  const meta = carried ?? (previous ? readingLine(previous.value, unit, previous.taken_on, today) : null);
  return {
    mode: 'open',
    role: 'button',
    title,
    label: carried ? `${title}, asked since ${carried.toLowerCase()}` : title,
    hint: 'Asks where you are.',
    meta,
  };
}

/**
 * A reading and the day it was taken: "82.4 kg yesterday", "3,260 lines on Thu, Aug 20".
 *
 * The preposition is the whole reason this is a function. `dayTitle` answers with a name for the
 * near days and a date for the rest, and the two take different grammar — "on Yesterday" is not a
 * sentence anyone writes, and lowercasing the date to fix it gives "on thu, aug 20". Named days
 * drop the "on" and go lowercase; a date keeps it and its capitals.
 */
export function readingLine(value: number, unit: string, takenOn: string, today: string): string {
  const when = dayTitle(takenOn, today);
  const named = when === 'Today' || when === 'Yesterday';
  return `${formatReading(value)} ${unit} ${named ? when.toLowerCase() : `on ${when}`}`;
}

/**
 * A reading, printed. The twin of {@link import('./goals').formatMeasure} and deliberately not an
 * import of it: that one separates thousands because a goal's total runs to five figures, and this
 * one is a single reading of a body on a scale. Both stop at one decimal.
 */
export function formatReading(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
