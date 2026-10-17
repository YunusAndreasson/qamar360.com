/**
 * The days behind the week bar and the calendar: each one's completion, read from the record and
 * kept current with the day you are working on.
 *
 * Pure, so the provider that holds it ({@link import('@/hooks/use-day-record').DayRecordProvider})
 * is only fetching and wiring.
 */

import type { CompletionRow } from '@/lib/progress';

/**
 * The viewed day's state as completion rows, in the shape the record stores: what the day's list
 * shows this instant, ticks the server has not confirmed yet included. `completed` holds count goals
 * that reached their target too, so a count still under it is the only `partial` row.
 */
export function rowsForDay(
  day: string,
  completed: ReadonlySet<string>,
  skipped: ReadonlySet<string>,
  counts: ReadonlyMap<string, number>,
): CompletionRow[] {
  const rows: CompletionRow[] = [];
  for (const habit_id of completed) rows.push({ habit_id, completed_at: day, status: 'done', count: counts.get(habit_id) ?? null });
  for (const habit_id of skipped) {
    if (!completed.has(habit_id)) rows.push({ habit_id, completed_at: day, status: 'skipped', count: null });
  }
  for (const [habit_id, count] of counts) {
    if (count > 0 && !completed.has(habit_id) && !skipped.has(habit_id)) {
      rows.push({ habit_id, completed_at: day, status: 'partial', count });
    }
  }
  return rows;
}

/** `rows` with every row of `day` swapped for `dayRows`. */
export function replaceDay(rows: CompletionRow[], day: string, dayRows: CompletionRow[]): CompletionRow[] {
  return [...rows.filter((row) => row.completed_at !== day), ...dayRows];
}

/**
 * A day's tally as the share of its orbit kept (0–1), or `null` when it asked for nothing: no act
 * was scheduled, or every one was excused. Not 0, because nothing was missed; the bar draws such a
 * day with no orbit at all rather than an empty one.
 */
export function rateOf(tally: { done: number; possible: number } | undefined): number | null {
  if (!tally || tally.possible === 0) return null;
  return tally.done / tally.possible;
}
