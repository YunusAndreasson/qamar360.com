/**
 * Reading `habit_completions` in full.
 *
 * PostgREST answers any one request with at most `max_rows` rows (1000 on hosted Supabase) and
 * says nothing when it stops there: no error, no flag, just a short array. A completion is one row
 * per habit per day kept, so ten habits pass that cap in about a hundred days, and every count
 * built on an unpaged read (degrees, the year, "This life", a stack's stats) quietly drops the
 * rest. Every completion read goes through here instead, paged on the table's own unique key so
 * no row is skipped or repeated across a page boundary.
 */

import type { CompletionRow } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

/** One page. Must not exceed the project's `max_rows`, or a full page arrives short and the read
 *  stops early (the read would undercount exactly as before). 1000 is Supabase's default. */
const PAGE_ROWS = 1000;

function completionsFor(userId: string) {
  return supabase.from('habit_completions').select('habit_id, completed_at, status, count').eq('user_id', userId);
}

type CompletionsQuery = ReturnType<typeof completionsFor>;

/** Every completion row of `userId` that `narrow` keeps (a habit, a window), however many there
 *  are. Throws on a query error. */
export async function fetchCompletionRows(
  userId: string,
  narrow: (query: CompletionsQuery) => CompletionsQuery = (query) => query,
): Promise<CompletionRow[]> {
  const rows: CompletionRow[] = [];
  for (;;) {
    // A fresh builder per page: a PostgREST builder runs once, when it is awaited.
    // `(habit_id, completed_at)` is the table's unique key, so this order is total.
    const { data, error } = await narrow(completionsFor(userId))
      .order('completed_at', { ascending: true })
      .order('habit_id', { ascending: true })
      .range(rows.length, rows.length + PAGE_ROWS - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_ROWS) return rows;
  }
}
