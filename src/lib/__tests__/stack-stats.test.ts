import { describe, expect, it } from '@jest/globals';

import type { CompletionRow, ProgressHabit } from '@/lib/progress';
import { computeStackStats } from '@/lib/stack-stats';

// Expectations are derived from *intended* behaviour, never copied from current output — a red
// test means the code is wrong, not the test. Anchor (verified against `Date#getDay`):
// 2026-01-31 is a Saturday.
const SAT = '2026-01-31';

/** An act of the stack: due every weekday, existing for all of history. */
const act = (id: string, extra: Partial<ProgressHabit> = {}): ProgressHabit => ({
  id,
  created_at: null,
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  hijri_schedule: null,
  ...extra,
});

const done = (iso: string, habit_id: string): CompletionRow => ({ habit_id, completed_at: iso, status: 'done', count: null });
const skip = (iso: string, habit_id: string): CompletionRow => ({ habit_id, completed_at: iso, status: 'skipped', count: null });
const countRow = (iso: string, habit_id: string, count: number): CompletionRow => ({
  habit_id,
  completed_at: iso,
  status: 'partial',
  count,
});

/** The two-act stack most cases below measure, and a whole day of it sealed. */
const pair = [act('a'), act('b')];
const sealed = (iso: string): CompletionRow[] => [done(iso, 'a'), done(iso, 'b')];

describe('computeStackStats — a day is binary', () => {
  it('credits a day only when every due act is done', () => {
    // 3 days: 29th and 31st sealed, 30th left with one act open → 2/3.
    const rows = [...sealed('2026-01-29'), done('2026-01-30', 'a'), ...sealed(SAT)];
    const stats = computeStackStats(pair, rows, SAT, 3);
    expect(stats.scheduledDays).toBe(3);
    expect(stats.consistency).toBeCloseTo(2 / 3, 10);
  });

  it('gives a part-sealed day no partial credit — the seal is all-or-nothing', () => {
    // A 4-act stack with 3 of 4 done on the 30th is a day the card never called complete: it must
    // read 0, not 0.75. With today sealed that is 1/2 overall, where a mean-of-acts rule says 7/8.
    const four = [act('a'), act('b'), act('c'), act('d')];
    const rows = [
      done('2026-01-30', 'a'),
      done('2026-01-30', 'b'),
      done('2026-01-30', 'c'),
      ...four.map((m) => done(SAT, m.id)),
    ];
    const stats = computeStackStats(four, rows, SAT, 2);
    expect(stats.scheduledDays).toBe(2);
    expect(stats.consistency).toBeCloseTo(1 / 2, 10);
  });

  it('seals a day whose remaining acts are all done, with one excused', () => {
    // `sealableActs` drops the excused act, so a stack of 2 with 1 excused seals on the other.
    const rows = [skip('2026-01-31', 'a'), done('2026-01-31', 'b')];
    const stats = computeStackStats(pair, rows, SAT, 1);
    expect(stats.scheduledDays).toBe(1);
    expect(stats.consistency).toBe(1);
  });

  it('does not seal on a count-goal act left short of its target', () => {
    // Act b needs 4; on the 30th a count of 2 is credit 0.5, not full — the day did not hold. With
    // today sealed that is 1/2, where crediting the part would say 7/8.
    const members = [act('a'), act('b', { target_count: 4 })];
    const rows = [done('2026-01-30', 'a'), countRow('2026-01-30', 'b', 2), ...sealed(SAT)];
    const stats = computeStackStats(members, rows, SAT, 2);
    expect(stats.scheduledDays).toBe(2);
    expect(stats.consistency).toBeCloseTo(1 / 2, 10);
  });
});

describe('computeStackStats — days that are not misses', () => {
  it('excuses a day on which every act is excused', () => {
    // 2-day window; on the 30th both acts are skipped. Nothing was ever going to be asserted, so
    // the day leaves the rate entirely rather than reading 0 — and the streak walks through it.
    const rows = [...sealed('2026-01-31'), skip('2026-01-30', 'a'), skip('2026-01-30', 'b')];
    const stats = computeStackStats(pair, rows, SAT, 2);
    expect(stats.scheduledDays).toBe(1); // only the 31st is in the sample
    expect(stats.consistency).toBe(1);
  });

  it('makes a day with no act due invisible', () => {
    // Both acts run Saturdays only, so the Friday in a 2-day window is not a miss — it is not a day
    // this stack has an opinion about at all.
    const saturdayOnly = [act('a', { schedule_days: [6] }), act('b', { schedule_days: [6] })];
    const stats = computeStackStats(saturdayOnly, sealed(SAT), SAT, 2);
    expect(stats.scheduledDays).toBe(1);
    expect(stats.consistency).toBe(1);
  });

  it('treats a still-open today as pending, not a miss', () => {
    // Sealed on the 30th, nothing yet today: the sample is yesterday alone and the run survives.
    const stats = computeStackStats(pair, sealed('2026-01-30'), SAT, 2);
    expect(stats.scheduledDays).toBe(1);
    expect(stats.consistency).toBe(1);
    expect(stats.currentStreak).toBe(1);
  });

  it('keeps a streak alive across an all-excused day', () => {
    const rows = [
      ...sealed('2026-01-29'),
      skip('2026-01-30', 'a'),
      skip('2026-01-30', 'b'),
      ...sealed('2026-01-31'),
    ];
    const stats = computeStackStats(pair, rows, SAT, 3);
    expect(stats.currentStreak).toBe(2);
  });
});

describe('computeStackStats — streaks', () => {
  it('breaks the run on a day the stack was left open, and keeps the longest', () => {
    // 29th sealed, 30th open (act b missing), 31st sealed → current 1, longest 1.
    const rows = [...sealed('2026-01-29'), done('2026-01-30', 'a'), ...sealed('2026-01-31')];
    const stats = computeStackStats(pair, rows, SAT, 3);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);
  });

  it('reports the longest run even once it is over', () => {
    // 27th, 28th, 29th sealed; 30th open; 31st sealed → current 1, longest 3.
    const rows = [...sealed('2026-01-27'), ...sealed('2026-01-28'), ...sealed('2026-01-29'), ...sealed('2026-01-31')];
    const stats = computeStackStats(pair, rows, SAT, 5);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(3);
  });
});

describe('computeStackStats — shape', () => {
  it('ignores completion rows belonging to habits outside the stack', () => {
    const rows = [...sealed('2026-01-31'), done('2026-01-31', 'stranger')];
    const stats = computeStackStats(pair, rows, SAT, 1);
    expect(stats.consistency).toBe(1);
  });

  it('is empty and never divides by zero with no history', () => {
    const stats = computeStackStats(pair, [], SAT, 30);
    // 29, not 30: today is open, and an open today is pending rather than a miss.
    expect(stats.scheduledDays).toBe(29);
    expect(stats.consistency).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestWeekday).toBeNull();
  });

  it('drops the weekday split only when every act is Hijri-scheduled', () => {
    const whiteDays = { monthDays: [13, 14, 15] };
    expect(computeStackStats([act('a', { hijri_schedule: whiteDays })], [], SAT, 30).weekdayApplicable).toBe(false);
    // One weekday-scheduled act is enough for the pattern to mean something.
    expect(computeStackStats([act('a', { hijri_schedule: whiteDays }), act('b')], [], SAT, 30).weekdayApplicable).toBe(true);
  });
});
