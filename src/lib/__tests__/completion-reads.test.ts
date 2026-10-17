import { beforeEach, expect, it, jest } from '@jest/globals';

import { fetchCompletionRows } from '@/lib/completion-reads';

/** A stand-in table behind a chainable builder: filters are recorded, `.range()` slices, and
 *  awaiting the builder answers like PostgREST — capped at `cap` rows, silently. */
const mockTable: { rows: { habit_id: string; completed_at: string; status: string; count: number }[]; cap: number } = {
  rows: [],
  cap: 1000,
};
const mockCalls: { from: number; to: number; filters: string[] }[] = [];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const call = { from: 0, to: Infinity, filters: [] as string[] };
      const builder = {
        select: () => builder,
        eq: (col: string, v: string) => (call.filters.push(`${col}=${v}`), builder),
        gte: (col: string, v: string) => (call.filters.push(`${col}>=${v}`), builder),
        order: () => builder,
        range: (from: number, to: number) => {
          call.from = from;
          call.to = to;
          mockCalls.push(call);
          return builder;
        },
        then: (resolve: (r: unknown) => void) =>
          resolve({ data: mockTable.rows.slice(call.from, Math.min(call.to + 1, call.from + mockTable.cap)), error: null }),
      };
      return builder;
    },
  },
}));

function seed(n: number) {
  mockTable.rows = Array.from({ length: n }, (_, i) => ({
    habit_id: `h${i % 10}`,
    completed_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    status: 'done',
    count: 1,
  }));
}

beforeEach(() => {
  mockCalls.length = 0;
  mockTable.cap = 1000;
});

it('reads past the 1000-row cap instead of stopping at it', async () => {
  seed(2350);
  const rows = await fetchCompletionRows('u1');
  expect(rows).toHaveLength(2350);
  expect(mockCalls.map((c) => c.from)).toEqual([0, 1000, 2000]);
});

it('takes one request when the record fits in a page', async () => {
  seed(40);
  expect(await fetchCompletionRows('u1')).toHaveLength(40);
  expect(mockCalls).toHaveLength(1);
});

it('asks one more page when the record is an exact multiple of the page', async () => {
  seed(2000);
  expect(await fetchCompletionRows('u1')).toHaveLength(2000);
  expect(mockCalls).toHaveLength(3);
});

it('applies the caller’s narrowing to every page, on top of the user', async () => {
  seed(1500);
  await fetchCompletionRows('u1', (q) => q.gte('completed_at', '2026-01-05'));
  expect(mockCalls).toHaveLength(2);
  for (const call of mockCalls) expect(call.filters).toEqual(['user_id=u1', 'completed_at>=2026-01-05']);
});
