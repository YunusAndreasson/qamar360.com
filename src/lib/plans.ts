/**
 * Plans — the things you mean to do, before they have a day.
 *
 * A stack is a sequence you keep, an exchange is a deed put where an old routine keeps happening,
 * and a task is a one-off captured for a day. All three are anchored in time. A plan is not: "take
 * the family to Denmark" has no date, and the reason it is worth keeping is the paragraph behind
 * the title — where you would go, what it would cost, what the children asked for.
 *
 * So a plan is deliberately **outside the day** entirely. It earns no degrees, it cannot hold a
 * day's close back, and nothing in `lib/progress.ts`, `lib/habit-stats.ts` or `lib/day-close.ts`
 * ever sees it. Its one point of contact with the day is that you can pull a **to-do** out of it
 * onto today or tomorrow, which writes an ordinary `tasks` row carrying the plan's id.
 *
 * The plan stays when you do that. One trip yields several to-dos over several weeks, and a list
 * that emptied itself the first time you acted on it would be a worse record of what you meant to
 * do than the one you started with.
 *
 * This module is pure so it can be tested — jest here matches `src/**\/*.test.ts` only, so a row's
 * state matrix inside a component would have no test at all (the same reason
 * {@link import('./tasks').taskRowContract} lives outside `TaskRow`).
 */

import type { Tables } from '@/lib/database.types';
import { addDaysISO, dayTitle } from '@/lib/dates';

/** One plan: a title, the notes behind it, and no day at all. */
export type Plan = Tables<'plans'>;

/**
 * The first line of the notes, for the second line of a row.
 *
 * A body is prose, not a field, so the row shows its opening rather than a truncation of the whole
 * thing: the first line of "Denmark with the family" is what you wrote to remind yourself what the
 * plan *is*, and the tenth is a ferry time. `null` for an empty body, so a plan that is still only
 * a name renders no second line at all rather than an empty one holding space open.
 */
function planExcerpt(body: string): string | null {
  const first = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  // Runs of whitespace inside the line collapse too: a row is one line high, and two spaces in the
  // middle of it are a gap the reader has to cross for nothing.
  return first ? first.replace(/\s+/g, ' ') : null;
}

/**
 * Where a to-do pulled from this plan is sitting.
 *
 * Only today and tomorrow can be chosen, so those are the two that read naturally. The third
 * branch exists because the function has to be total — a row written by another client, or one
 * that has carried forward — and not because the UI can reach it. A `due_on` at or before today is
 * "today": that is where an open to-do actually appears, whether it is its own day or it has
 * carried forward (`tasks.showsOn`).
 */
export function scheduledLabel(dueOn: string, today: string): string {
  if (dueOn <= today) return 'On today’s list';
  if (dueOn === addDaysISO(today, 1)) return 'On tomorrow’s list';
  return `On the list for ${dayTitle(dueOn, today)}`;
}

/**
 * A plan row's second line, or `null` for no second line at all.
 *
 * The scheduled label displaces the notes rather than joining them. Both want the same single line,
 * and only one of them is news: the notes are the same notes they were yesterday, while "on
 * tomorrow's list" is the thing that changed and the thing you would act on.
 *
 * `null` rather than an empty string, so a plan that is still only a name renders no second line at
 * all instead of one holding space open — the same answer {@link import('./tasks').carriedLabel}
 * gives for a task on its own day.
 */
export function planMeta({
  body,
  scheduledOn,
  today,
}: {
  body: string;
  /** `due_on` of the open to-do pulled from this plan, or `null` if there isn't one. */
  scheduledOn: string | null;
  today: string;
}): string | null {
  if (scheduledOn !== null) return scheduledLabel(scheduledOn, today);
  return planExcerpt(body);
}

/**
 * The plans offered inside the to-do field — the shortcut, not the list.
 *
 * A plan already on today's list is left out: the field is open because you are adding something
 * to today, and the one row guaranteed to be a duplicate is the worst suggestion it could make.
 * Anything scheduled for tomorrow stays in, since putting it on today as well is a real choice.
 *
 * Capped, because this is a strip under a field and not a list: past a few rows it stops being a
 * shortcut and starts being the screen you should have opened instead.
 */
export function planPicks(
  plans: readonly Plan[],
  scheduledOn: ReadonlyMap<string, string>,
  today: string,
  limit: number,
): Plan[] {
  return plans
    .filter((plan) => {
      const dueOn = scheduledOn.get(plan.id);
      return dueOn === undefined || dueOn > today;
    })
    .slice(0, limit);
}
