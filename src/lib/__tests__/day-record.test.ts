import { describe, expect, it } from '@jest/globals';

import { rateOf, replaceDay, rowsForDay } from '@/lib/day-record';
import { tallyDays, type CompletionRow, type ProgressHabit } from '@/lib/progress';

const DAY = '2026-10-20';
const daily = (id: string, target_count: number | null = null): ProgressHabit => ({
  id,
  created_at: null,
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  hijri_schedule: null,
  target_count,
});

describe('rowsForDay', () => {
  it('turns the day’s ticks, excusals and counts into the rows the record keeps', () => {
    const rows = rowsForDay(DAY, new Set(['a', 'pages']), new Set(['b']), new Map([['pages', 5], ['dhikr', 33]]));
    expect(rows).toEqual([
      { habit_id: 'a', completed_at: DAY, status: 'done', count: null },
      { habit_id: 'pages', completed_at: DAY, status: 'done', count: 5 },
      { habit_id: 'b', completed_at: DAY, status: 'skipped', count: null },
      { habit_id: 'dhikr', completed_at: DAY, status: 'partial', count: 33 },
    ]);
  });

  it('credits the day exactly as the server’s rows for it would', () => {
    // The orbit above the day you are ticking must read what the same day will read once the
    // writes land: the live sets and the stored rows are two spellings of one day.
    const habits = [daily('a'), daily('b'), daily('dhikr', 100), daily('c')];
    const stored: CompletionRow[] = [
      { habit_id: 'a', completed_at: DAY, status: 'done', count: null },
      { habit_id: 'b', completed_at: DAY, status: 'skipped', count: null },
      { habit_id: 'dhikr', completed_at: DAY, status: 'partial', count: 33 },
    ];
    const live = rowsForDay(DAY, new Set(['a']), new Set(['b']), new Map([['dhikr', 33]]));
    expect(tallyDays(habits, live, DAY, DAY).get(DAY)).toEqual(tallyDays(habits, stored, DAY, DAY).get(DAY));
  });

  it('leaves a zero count out, as nothing logged', () => {
    expect(rowsForDay(DAY, new Set(), new Set(), new Map([['dhikr', 0]]))).toEqual([]);
  });
});

describe('replaceDay', () => {
  it('swaps one day’s rows and keeps every other day’s', () => {
    const before: CompletionRow[] = [
      { habit_id: 'a', completed_at: '2026-10-19', status: 'done', count: null },
      { habit_id: 'a', completed_at: DAY, status: 'done', count: null },
    ];
    const after = replaceDay(before, DAY, [{ habit_id: 'b', completed_at: DAY, status: 'done', count: null }]);
    expect(after).toEqual([
      { habit_id: 'a', completed_at: '2026-10-19', status: 'done', count: null },
      { habit_id: 'b', completed_at: DAY, status: 'done', count: null },
    ]);
  });
});

describe('rateOf', () => {
  it('is the share kept, and null for a day that asked nothing (not a miss)', () => {
    expect(rateOf({ done: 3, possible: 4 })).toBe(0.75);
    expect(rateOf({ done: 0, possible: 4 })).toBe(0);
    expect(rateOf({ done: 0, possible: 0 })).toBeNull();
    expect(rateOf(undefined)).toBeNull();
  });
});
