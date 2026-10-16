/**
 * Tasks — the one-off things a day contains.
 *
 * A stack is a sequence you keep; an exchange is a deed put where an old routine keeps happening.
 * Both repeat, and both are recorded as `habit_completions` rows, which is why degrees, the month
 * ring, the year trend, streaks and Stats read them without knowing they exist. A task is
 * neither: call the landlord, pick up the prescription — it happens once and is finished.
 *
 * So a task is deliberately **outside the lunar currency**. `computeProgress` derives a month's
 * rate by re-walking every habit's schedule across past days; a row with no recurring schedule,
 * which stops existing the moment it is done, would silently rewrite the rates of months already
 * closed. Its own table, its own provider, and nothing in `lib/progress.ts` or `lib/habit-stats.ts`
 * ever sees it. The one place the two systems touch is the day's close (`lib/day-close.ts`): an
 * open task holds the celebration back, because the day isn't finished while something on it is.
 *
 * This module is pure so it can be tested — jest here matches `src/**\/*.test.ts` only, so a row's
 * state matrix inside a component would have no test at all (the same reason
 * {@link import('./exchange').exchangeRowContract} lives outside `ExchangeRow`).
 */

import type { Tables } from '@/lib/database.types';
import { dayTitle } from '@/lib/dates';

/** One task row. `done_on` null = still open; non-null is the local day it was ticked. */
export type Task = Tables<'tasks'>;

/** The fields the day rules read — `Task` satisfies this structurally. */
export type Schedulable = Pick<Task, 'due_on' | 'done_on'>;

/** Is this task still to do? */
export function isOpen(task: Schedulable): boolean {
  return task.done_on === null;
}

/**
 * Does `task` belong on the day being viewed?
 *
 * Three ways in, and the third is the whole point:
 * 1. it was **done** on that day (so a backfilled day shows what actually happened then);
 * 2. it is **open and due** on that day (its home);
 * 3. it is **open and overdue**, and the day in question is today — the *carry-forward*. An
 *    unfinished task follows you rather than being quietly lost on the day it was written, which
 *    is the only behaviour that makes a list worth writing things down on.
 *
 * A done task therefore leaves the list when the day rolls over, and an open one never does.
 */
export function showsOn(task: Schedulable, day: string, today: string): boolean {
  if (task.done_on !== null) return task.done_on === day;
  if (task.due_on === day) return true;
  return day === today && task.due_on < today;
}

/**
 * The day's tasks, in the order they were written down.
 *
 * A finished one is **not** sunk to the foot of the card. Sinking is the common pattern, and it is
 * wrong here for the same reason vanishing would be: the row you just ticked would move out from
 * under the finger that ticked it, and the undo you might want a second later is no longer where
 * you left it. It greys where it stands and leaves when the day turns over.
 */
export function visibleTasks<T extends Task>(tasks: readonly T[], day: string, today: string): T[] {
  return tasks.filter((t) => showsOn(t, day, today)).sort((a, b) => a.position - b.position);
}

/** How many tasks are still open on `day` — what holds the day's close back. */
export function openCountOn(tasks: readonly Task[], day: string, today: string): number {
  return tasks.filter((t) => isOpen(t) && showsOn(t, day, today)).length;
}

/**
 * The quiet second line on a task that has come forward from an earlier day — "Yesterday", then a
 * bare weekday while that is still unambiguous, then the date. `null` for a task on its own day,
 * which says nothing because there is nothing to say.
 *
 * Deliberately no "overdue", no red, no count of days missed: the same negative space the rest of
 * the app keeps around a miss. It is a note of where the thing came from, not a reproach.
 */
export function carriedLabel(dueOn: string, today: string): string | null {
  // The `null` is the whole point of the branch: `dayTitle` would answer "Today" here, and a task
  // on its own day has nothing to say about where it came from.
  if (dueOn >= today) return null;
  // The header's settings — a bare weekday while that still picks a day out. A carried task sits
  // among today's, one line under its title, so a long name is the wrong shape for it; and nothing
  // carries forward across a year.
  return dayTitle(dueOn, today, { weekday: 'long' });
}

/**
 * The names of the open to-dos waiting on `day` — what tomorrow already has on it.
 *
 * `showsOn` deliberately answers `false` for a to-do dated ahead: it belongs to that day and to no
 * other, which is why it does not clutter today and cannot hold today's close back. But the day
 * view only ever reaches backwards, so between writing one and midnight there would be nowhere at
 * all to see it. This is that place — the almanac line at the head of Today, which already says
 * what tomorrow is asking of you.
 */
export function openTitlesOn(tasks: readonly Task[], day: string): string[] {
  return tasks
    .filter((task) => isOpen(task) && task.due_on === day)
    .sort((a, b) => a.position - b.position)
    .map((task) => task.title);
}

export type TaskRowContract = {
  /** `'open'` — the tap ticks it; `'done'` — the tap takes it back. */
  mode: 'open' | 'done';
  /** The row *is* the control, the way a stack card's header and an exchange row are. */
  role: 'checkbox';
  checked: boolean;
  label: string;
  hint: string;
  /** Where it came from, when that isn't today. `null` renders no second line at all. */
  meta: string | null;
};

/** Everything the row paints, resolved once and tested here rather than in the component. */
export function taskRowContract({
  title,
  dueOn,
  today,
  done,
}: {
  title: string;
  dueOn: string;
  today: string;
  done: boolean;
}): TaskRowContract {
  const meta = carriedLabel(dueOn, today);
  return {
    mode: done ? 'done' : 'open',
    role: 'checkbox',
    checked: done,
    // No ", done" appended: that state is carried by `checked` on this same element, and saying it
    // twice is what the stack header's label was cleaned up to stop doing. The carried-from day is
    // spoken, though — it is information the sighted row shows and the label otherwise drops.
    label: meta ? `${title}, from ${meta.toLowerCase()}` : title,
    hint: done ? 'Puts it back on the list.' : 'Marks it done.',
    meta,
  };
}

/** Where a to-do sits on the card: in the day's open list, or folded with the finished ones. */
export type TaskPlace = 'open' | 'done';

/**
 * The to-do card's two halves: the open list, and the finished ones that fold away under it.
 *
 * A row's place normally follows its state, with two exceptions that keep the card still under the
 * finger:
 *
 * - **`held`** pins a row to the place it had when it was last touched. Ticking a to-do greys it in
 *   place rather than whisking it into the fold — a row that moved under the finger would take its
 *   own undo with it — and un-ticking one inside the open fold leaves it there. The card clears the
 *   pins when the list *settles* (the screen comes back into focus), and everything then sits where
 *   its state says.
 * - **A fold that would hold one line is no fold.** With fewer than two finished, the finished one
 *   stays in the open list, greyed, exactly as it was before there was a fold to put it in.
 *
 * Both halves keep the day's `position` order.
 */
export function splitTasks<T extends Task>(
  tasks: readonly T[],
  held: ReadonlyMap<string, TaskPlace>,
): { open: T[]; done: T[] } {
  const placeOf = (task: T): TaskPlace => held.get(task.id) ?? (task.done_on !== null ? 'done' : 'open');
  const done = tasks.filter((task) => placeOf(task) === 'done');
  if (done.length < 2) return { open: [...tasks], done: [] };
  return { open: tasks.filter((task) => placeOf(task) === 'open'), done };
}
