import { beforeEach, expect, it, vi } from 'vitest'

import { fetchCompletionRows } from '../completion-reads'
import { addDaysISO } from '../dates'

type Row = { habit_id: string; completed_at: string; status: string; count: number }

/** A stand-in table behind a chainable builder that answers like PostgREST: the filters really
 *  filter (including the keyset `or` the module writes), rows come back in key order, and a
 *  request is capped at 1000 rows, silently. `beforeAnswer` runs as each request is answered, so
 *  a test can write to the table mid-read. */
const table = vi.hoisted(() => ({
  rows: [] as { habit_id: string; completed_at: string; status: string; count: number }[],
  beforeAnswer: (_call: number) => {},
  calls: [] as { filters: string[]; returned: number; builtBefore: number }[],
  built: 0,
}))

vi.mock('#/lib/supabase/client', () => ({
  supabaseBrowser: {
    from: () => {
      type R = (typeof table.rows)[number]
      const call = { filters: [] as string[], returned: 0, builtBefore: 0 }
      const keep: ((r: R) => boolean)[] = []
      let counted = false
      let limit = Infinity
      const col = (r: R, c: string) => String(r[c as keyof R])
      const builder = {
        select: (_cols: string, opts?: { count?: string }) => ((counted = opts?.count === 'exact'), builder),
        gte: (c: string, v: string) => (call.filters.push(`${c}>=${v}`), keep.push((r) => col(r, c) >= v), builder),
        lt: (c: string, v: string) => (call.filters.push(`${c}<${v}`), keep.push((r) => col(r, c) < v), builder),
        or: (expr: string) => {
          call.filters.push(`or ${expr}`)
          const [, date, , habit] =
            /^completed_at\.gt\.([^,]+),and\(completed_at\.eq\.([^,]+),habit_id\.gt\.([^)]+)\)$/.exec(expr)!
          keep.push((r) => r.completed_at > date! || (r.completed_at === date && r.habit_id > habit!))
          return builder
        },
        order: () => builder,
        limit: (n: number) => ((limit = n), table.built++, builder),
        then: (resolve: (r: unknown) => void) => {
          table.beforeAnswer(table.calls.length)
          call.builtBefore = table.built
          table.calls.push(call)
          const matching = table.rows
            .filter((r) => keep.every((k) => k(r)))
            .sort((a, b) => a.completed_at.localeCompare(b.completed_at) || a.habit_id.localeCompare(b.habit_id))
          const data = matching.slice(0, Math.min(limit, 1000))
          call.returned = data.length
          resolve({ data, error: null, count: counted ? matching.length : null })
        },
      }
      return builder
    },
  },
}))

/** `days` days from `from`, `perDay` habits kept on each: one row per (habit, day), as the table's
 *  unique key allows. */
function rowsOver(days: number, perDay: number, from = '2026-01-01'): Row[] {
  return Array.from({ length: days * perDay }, (_, i) => ({
    habit_id: `h${String(i % perDay).padStart(2, '0')}`,
    completed_at: addDaysISO(from, Math.floor(i / perDay)),
    status: 'done',
    count: 1,
  }))
}

const key = (r: Pick<Row, 'completed_at' | 'habit_id'>) => `${r.completed_at}/${r.habit_id}`

beforeEach(() => {
  table.calls.length = 0
  table.built = 0
  table.beforeAnswer = () => {}
})

it('takes one request when the record fits in a page', async () => {
  table.rows = rowsOver(4, 10)
  expect(await fetchCompletionRows()).toHaveLength(40)
  expect(table.calls).toHaveLength(1)
})

it('takes one request when the record is exactly a page, since the count says so', async () => {
  table.rows = rowsOver(100, 10)
  expect(await fetchCompletionRows()).toHaveLength(1000)
  expect(table.calls).toHaveLength(1)
})

it('reads past the 1000-row cap, every row once, in key order, in two rounds', async () => {
  table.rows = rowsOver(600, 10) // 6000 rows
  const rows = await fetchCompletionRows()
  expect(rows.map(key)).toEqual(table.rows.map(key))
  // The first page, then the 5000 left as slices of ~750 rows, all sent before any is answered.
  expect(table.calls).toHaveLength(8)
  expect(table.calls[1]!.builtBefore).toBe(8)
})

it('still reads every row when the first page misjudges the density', async () => {
  table.rows = [...rowsOver(1000, 1), ...rowsOver(200, 40, '2029-01-01')]
  const rows = await fetchCompletionRows()
  expect(rows).toHaveLength(9000)
  expect(new Set(rows.map(key)).size).toBe(9000)
})

it('neither skips nor repeats a row when ticks land mid-read', async () => {
  table.rows = rowsOver(300, 10)
  const before = table.rows.map(key)
  table.beforeAnswer = (call) => {
    if (call !== 1) return
    table.rows.push({ habit_id: 'h99', completed_at: '2026-01-02', status: 'done', count: 1 })
    table.rows.push({ habit_id: 'h99', completed_at: '2026-10-01', status: 'done', count: 1 })
  }
  const rows = (await fetchCompletionRows()).map(key)
  expect(new Set(rows).size).toBe(rows.length)
  for (const k of before) expect(rows).toContain(k)
  expect(rows).toContain('2026-10-01/h99')
})

it('applies the caller’s window to every request', async () => {
  table.rows = rowsOver(300, 10)
  const rows = await fetchCompletionRows((q) => q.gte('completed_at', '2026-01-05'))
  expect(rows).toHaveLength(2960)
  expect(table.calls.length).toBeGreaterThan(1)
  for (const call of table.calls) expect(call.filters[0]).toBe('completed_at>=2026-01-05')
})
