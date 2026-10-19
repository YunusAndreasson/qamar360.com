/**
 * Reading `habit_completions` in full, ported from the mobile app (`src/lib/completion-reads.ts`).
 *
 * PostgREST answers any one request with at most `max_rows` rows (1000 on hosted Supabase) and
 * says nothing when it stops there: no error, no flag, just a short array. A completion is one row
 * per habit per day kept, so ten habits pass that cap in about a hundred days, and an unpaged read
 * quietly drops the rest: the dashboard would undercount a heavy account with nothing to show it.
 *
 * The read is keyset-paged on `(completed_at, habit_id)`, the table's unique key: each page asks
 * for the rows strictly after the last key it has, never for "rows 2000 to 2999". An offset moves
 * when a tick lands mid-read, so an offset page can skip a row or repeat one; a key does not move.
 * And so the read is not one round trip per thousand rows, everything past the first page is cut
 * into date slices fetched at once, each keyset-paged on its own. The slices are disjoint ranges
 * of `completed_at`, so a row belongs to exactly one of them whatever is written meanwhile.
 */

import { addDaysISO, localDate } from '#/lib/dates'
import type { CompletionRow } from '#/lib/progress'
import { supabaseBrowser } from '#/lib/supabase/client'

/** One page. Must not exceed the project's `max_rows`, or a full page arrives short and the read
 *  stops early (the read would undercount exactly as before). 1000 is Supabase's default. */
const PAGE_ROWS = 1000

/** The rows a slice is planned to hold: under a page, so a guess a little low on the density
 *  still lands in one request. */
const SLICE_ROWS = 750

/** At most this many slices in flight at once. Past it the slices just grow, and page in turn. */
const MAX_SLICES = 8

/** The signed-in user's completions; RLS scopes the table to them, so no `user_id` filter. */
function completions(count?: 'exact') {
  return supabaseBrowser
    .from('habit_completions')
    .select('habit_id, completed_at, status, count', count ? { count } : undefined)
}

type CompletionsQuery = ReturnType<typeof completions>
type Narrow = (query: CompletionsQuery) => CompletionsQuery

/** Where a slice starts. With a habit, strictly after that row's key (a page boundary); with
 *  `habitId: null`, the whole of `date` onward (a slice boundary). */
type Start = { date: string; habitId: string | null }

/** A run of the read: from `start`, up to the day `until` (exclusive), or to the end when null. */
type Slice = { start: Start | null; until: string | null }

/** One page of `slice`. A fresh builder per page: a PostgREST builder runs once, when awaited. */
function pageOf(narrow: Narrow, slice: Slice, count?: 'exact') {
  let query = narrow(completions(count))
  const { start, until } = slice
  if (start?.habitId === null) query = query.gte('completed_at', start.date)
  else if (start)
    query = query.or(`completed_at.gt.${start.date},and(completed_at.eq.${start.date},habit_id.gt.${start.habitId})`)
  if (until !== null) query = query.lt('completed_at', until)
  return query.order('completed_at', { ascending: true }).order('habit_id', { ascending: true }).limit(PAGE_ROWS)
}

function after(row: CompletionRow): Start {
  return { date: row.completed_at, habitId: row.habit_id }
}

/** Every row of `slice`, a page at a time, each page starting after the last key read. */
async function readSlice(narrow: Narrow, slice: Slice): Promise<CompletionRow[]> {
  const rows: CompletionRow[] = []
  for (let start = slice.start; ; ) {
    const { data, error } = await pageOf(narrow, { start, until: slice.until })
    if (error) throw error
    const page: CompletionRow[] = data ?? []
    rows.push(...page)
    if (page.length < PAGE_ROWS) return rows
    start = after(page[page.length - 1]!)
  }
}

/** Whole days from `from` to `to`; `Math.round` absorbs the 23- and 25-hour days of a DST turn. */
function daysBetween(from: string, to: string): number {
  return Math.round((localDate(to).getTime() - localDate(from).getTime()) / 86_400_000)
}

/**
 * Cuts what follows a full first page into date slices. The first page says how dense the record
 * runs (its rows over the days it spans) and, with `count`, how many rows are left; from those, the
 * days a slice of about {@link SLICE_ROWS} rows covers. The guess only sets how many requests the
 * read takes, never what it returns: a slice that runs over pages on, and the last slice has no
 * end, so whatever lies past the guess is still read.
 */
function planSlices(first: CompletionRow[], total: number | null): Slice[] {
  const last = first[first.length - 1]!
  const remaining = total === null ? 0 : total - first.length
  const parts = Math.min(MAX_SLICES, Math.ceil(remaining / SLICE_ROWS))
  if (parts <= 1) return [{ start: after(last), until: null }]
  const rowsPerDay = first.length / (daysBetween(first[0]!.completed_at, last.completed_at) + 1)
  const daysPerSlice = Math.max(1, Math.ceil(remaining / rowsPerDay / parts))
  const bounds = Array.from({ length: parts - 1 }, (_, i) => addDaysISO(last.completed_at, (i + 1) * daysPerSlice))
  return [
    { start: after(last), until: bounds[0]! },
    ...bounds.map((day, i) => ({ start: { date: day, habitId: null }, until: bounds[i + 1] ?? null })),
  ]
}

/** Every completion row of the signed-in user that `narrow` keeps (a window), however many there
 *  are, in `(completed_at, habit_id)` order. One request when they fit in a page, two rounds
 *  otherwise. Throws on a query error. */
export async function fetchCompletionRows(narrow: Narrow = (query) => query): Promise<CompletionRow[]> {
  // The first page also asks for the total. Counted in the same statement, it agrees with the
  // page, so a record that fits exactly in one page costs no second request.
  const { data, error, count } = await pageOf(narrow, { start: null, until: null }, 'exact')
  if (error) throw error
  const first: CompletionRow[] = data ?? []
  if (first.length < PAGE_ROWS || (count !== null && count <= first.length)) return first
  const rest = await Promise.all(planSlices(first, count).map((slice) => readSlice(narrow, slice)))
  return first.concat(...rest)
}
