import { beforeEach, expect, it, jest } from '@jest/globals';

import { fetchCompletionRows } from '@/lib/completion-reads';
import { addDaysISO } from '@/lib/dates';

type Row = { habit_id: string; completed_at: string; status: string; count: number };

/** A stand-in table behind a chainable builder that answers like PostgREST: the filters really
 *  filter (including the keyset `or` this module writes), rows come back in key order, and a
 *  request is capped at `cap` rows, silently. `beforeAnswer` runs as each request is answered,
 *  so a test can write to the table mid-read. */
const mockTable: { rows: Row[]; cap: number; beforeAnswer: (call: number) => void } = {
  rows: [],
  cap: 1000,
  beforeAnswer: () => {},
};
const mockCalls: { filters: string[]; counted: boolean; returned: number; builtBefore: number }[] = [];
let mockBuilt = 0;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const call = { filters: [] as string[], counted: false, returned: 0, builtBefore: 0 };
      const keep: ((r: Row) => boolean)[] = [];
      let limit = Infinity;
      const col = (r: Row, c: string) => String(r[c as keyof Row]);
      const builder = {
        select: (_cols: string, opts?: { count?: string }) => ((call.counted = opts?.count === 'exact'), builder),
        eq: (c: string, v: string) => (call.filters.push(`${c}=${v}`), c === 'user_id' || keep.push((r) => col(r, c) === v), builder),
        gte: (c: string, v: string) => (call.filters.push(`${c}>=${v}`), keep.push((r) => col(r, c) >= v), builder),
        lte: (c: string, v: string) => (call.filters.push(`${c}<=${v}`), keep.push((r) => col(r, c) <= v), builder),
        lt: (c: string, v: string) => (call.filters.push(`${c}<${v}`), keep.push((r) => col(r, c) < v), builder),
        in: (c: string, vs: string[]) => (call.filters.push(`${c} in ${vs}`), keep.push((r) => vs.includes(col(r, c))), builder),
        or: (expr: string) => {
          call.filters.push(`or ${expr}`);
          const [, date, , habit] = /^completed_at\.gt\.([^,]+),and\(completed_at\.eq\.([^,]+),habit_id\.gt\.([^)]+)\)$/.exec(expr)!;
          keep.push((r) => r.completed_at > date! || (r.completed_at === date && r.habit_id > habit!));
          return builder;
        },
        order: () => builder,
        limit: (n: number) => ((limit = n), mockBuilt++, builder),
        then: (resolve: (r: unknown) => void) => {
          mockTable.beforeAnswer(mockCalls.length);
          call.builtBefore = mockBuilt;
          mockCalls.push(call);
          const matching = mockTable.rows
            .filter((r) => keep.every((k) => k(r)))
            .sort((a, b) => a.completed_at.localeCompare(b.completed_at) || a.habit_id.localeCompare(b.habit_id));
          const data = matching.slice(0, Math.min(limit, mockTable.cap));
          call.returned = data.length;
          resolve({ data, error: null, count: call.counted ? matching.length : null });
        },
      };
      return builder;
    },
  },
}));

/** `days` days from 2026-01-01, `perDay` habits kept on each: one row per (habit, day), as the
 *  table's unique key allows. */
function rowsOver(days: number, perDay: number, from = '2026-01-01'): Row[] {
  return Array.from({ length: days * perDay }, (_, i) => ({
    habit_id: `h${String(i % perDay).padStart(2, '0')}`,
    completed_at: addDaysISO(from, Math.floor(i / perDay)),
    status: 'done',
    count: 1,
  }));
}

const key = (r: Pick<Row, 'completed_at' | 'habit_id'>) => `${r.completed_at}/${r.habit_id}`;

beforeEach(() => {
  mockCalls.length = 0;
  mockBuilt = 0;
  mockTable.cap = 1000;
  mockTable.beforeAnswer = () => {};
});

it('takes one request when the record fits in a page', async () => {
  mockTable.rows = rowsOver(4, 10);
  expect(await fetchCompletionRows('u1')).toHaveLength(40);
  expect(mockCalls).toHaveLength(1);
});

it('takes one request when the record is exactly a page, since the count says so', async () => {
  mockTable.rows = rowsOver(100, 10);
  expect(await fetchCompletionRows('u1')).toHaveLength(1000);
  expect(mockCalls).toHaveLength(1);
});

it('reads past the 1000-row cap, every row once, in key order', async () => {
  mockTable.rows = rowsOver(600, 10);
  const rows = await fetchCompletionRows('u1');
  expect(rows.map(key)).toEqual(mockTable.rows.map(key));
});

it('reads the rest in parallel slices, not one round trip per page', async () => {
  mockTable.rows = rowsOver(600, 10); // 6000 rows
  await fetchCompletionRows('u1');
  // The first page, then the 5000 left as slices of ~750 rows, each one page, all sent before
  // any of them is answered: two rounds in all.
  expect(mockCalls).toHaveLength(8);
  expect(mockCalls.slice(1).every((c) => c.returned < 1000)).toBe(true);
  expect(mockCalls[1]!.builtBefore).toBe(8);
});

it('still reads every row when the first page misjudges the density', async () => {
  // A sparse first year, then forty habits a day: the slices planned from the first page are far
  // too long, and must page on rather than stop.
  mockTable.rows = [...rowsOver(1000, 1), ...rowsOver(200, 40, '2029-01-01')];
  const rows = await fetchCompletionRows('u1');
  expect(rows).toHaveLength(9000);
  expect(new Set(rows.map(key)).size).toBe(9000);
});

it('neither skips nor repeats a row when ticks land mid-read', async () => {
  mockTable.rows = rowsOver(300, 10);
  const before = mockTable.rows.map(key);
  // After the first page: a tick on an early day (would shift every offset by one) and one late.
  mockTable.beforeAnswer = (call) => {
    if (call === 1) mockTable.rows.push({ habit_id: 'h99', completed_at: '2026-01-02', status: 'done', count: 1 });
    if (call === 1) mockTable.rows.push({ habit_id: 'h99', completed_at: '2026-10-01', status: 'done', count: 1 });
  };
  const rows = (await fetchCompletionRows('u1')).map(key);
  expect(new Set(rows).size).toBe(rows.length);
  for (const k of before) expect(rows).toContain(k);
  expect(rows).toContain('2026-10-01/h99');
});

it('applies the caller’s narrowing to every request, on top of the user', async () => {
  mockTable.rows = rowsOver(300, 10);
  const rows = await fetchCompletionRows('u1', (q) => q.gte('completed_at', '2026-01-05'));
  expect(rows).toHaveLength(2960);
  expect(mockCalls.length).toBeGreaterThan(1);
  for (const call of mockCalls) expect(call.filters.slice(0, 2)).toEqual(['user_id=u1', 'completed_at>=2026-01-05']);
});
