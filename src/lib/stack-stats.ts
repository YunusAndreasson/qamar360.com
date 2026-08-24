/**
 * Per-stack stats math, powering the stack's "Stats" screen — the sibling of
 * {@link computeHabitStats}, and deliberately the same {@link HabitStats} shape, so the four cards
 * built for one habit render a whole stack without knowing the difference.
 *
 * A stack has no completion row of its own: sealing writes one ordinary `done` row per act (see
 * `sealStack`), which is why Progress, streaks and per-habit Stats need to know nothing about
 * stacks. The price is that a stack's history has to be *replayed* out of its acts' rows, and this
 * module is where that replay lives.
 *
 * The rule is the historical form of {@link isStackComplete}, resolving membership the way
 * {@link sealableActs} does — because the card, the seal and this history must describe the same
 * set, or a day the app called sealed would read here as a miss.
 */

import { scheduledOn } from '@/lib/dates';
import { statsFromDailyCredit, STATS_WINDOW_DAYS, type DailyCredit, type HabitStats } from '@/lib/habit-stats';
import { creditFor, type CompletionRow, type ProgressHabit } from '@/lib/progress';

/** A stack's act, as the stats need it — `Habit` satisfies it structurally. */
export type StackMemberHabit = ProgressHabit;

/**
 * What one day was worth to a stack. **Binary, by design**: the stack is the unit this app tracks
 * and it commits with one seal, so a day either held or it didn't. Crediting 3-of-4 acts would
 * count a day that the card, the day-close celebration and the tab badge all treated as still open.
 *
 * - No act due ⟹ `undefined`: the stack wasn't on, and the day is invisible.
 * - Every due act excused ⟹ `null`: nothing was ever going to be asserted, so the day is excused
 *   rather than a zero — the same mercy a skipped habit gets, and the reason
 *   {@link isStackComplete} refuses to call an all-excused stack complete.
 * - Otherwise ⟹ 1 only if every act still in play earned full credit.
 *
 * Fullness is read through the shared {@link creditFor} rather than by testing `status === 'done'`,
 * so a count-goal act left short of its target can't quietly seal the day.
 */
function stackCreditOn(members: readonly StackMemberHabit[], rowsFor: (id: string) => CompletionRow | undefined, iso: string): DailyCredit {
  let due = 0;
  let open = 0;
  let held = 0;
  for (const member of members) {
    if (!scheduledOn(member, iso)) continue;
    due += 1;
    const credit = creditFor(member, rowsFor(member.id));
    if (credit === null) continue; // excused — as `sealableActs` drops it from the seal
    open += 1;
    if (credit === 1) held += 1;
  }
  if (due === 0) return undefined;
  if (open === 0) return null;
  return held === open ? 1 : 0;
}

/**
 * Derive every stat for one stack from its acts' raw completion rows. Pure, like its per-habit
 * sibling. `completions` may contain rows for habits outside the stack (the caller's window); rows
 * whose `habit_id` belongs to no member are ignored.
 *
 * `weekdayApplicable` is false only when *every* act is Hijri-scheduled — a stack with even one
 * weekday-scheduled act still has a weekday pattern worth drawing.
 */
export function computeStackStats(
  members: readonly StackMemberHabit[],
  completions: CompletionRow[],
  today: string,
  windowDays = STATS_WINDOW_DAYS,
): HabitStats {
  // habit id → date → its completion row (one row per habit per day).
  const ids = new Set(members.map((m) => m.id));
  const rowsByHabit = new Map<string, Map<string, CompletionRow>>();
  for (const row of completions) {
    if (!ids.has(row.habit_id)) continue;
    let byDate = rowsByHabit.get(row.habit_id);
    if (!byDate) {
      byDate = new Map();
      rowsByHabit.set(row.habit_id, byDate);
    }
    byDate.set(row.completed_at, row);
  }

  return statsFromDailyCredit(
    (iso) => stackCreditOn(members, (id) => rowsByHabit.get(id)?.get(iso), iso),
    today,
    members.some((m) => !m.hijri_schedule),
    windowDays,
  );
}
