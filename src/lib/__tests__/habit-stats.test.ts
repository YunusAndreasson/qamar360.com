import { describe, expect, it } from '@jest/globals';

import { computeHabitStats } from '@/lib/habit-stats';
import type { CompletionRow, ProgressHabit } from '@/lib/progress';

// Expectations are derived from *intended* behaviour, never copied from current output — a red
// test means the code is wrong, not the test. Anchors (verified against `Date#getDay`):
//   2026-01-31 is a Saturday; the 14-day window 2026-01-18(Sun)…2026-01-31(Sat) holds exactly
//   two of every weekday, so a daily habit's weekday buckets each have scheduledCount 2.
const SAT = '2026-01-31';

/** A daily habit (every weekday), existing for all of history (creation unknown → never filtered). */
const dailyHabit = (id = 'h'): ProgressHabit => ({
  id,
  created_at: null,
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  hijri_schedule: null,
});

const done = (iso: string, habit_id = 'h'): CompletionRow => ({ habit_id, completed_at: iso, status: 'done', count: null });
const skip = (iso: string, habit_id = 'h'): CompletionRow => ({ habit_id, completed_at: iso, status: 'skipped', count: null });
const countRow = (iso: string, count: number, status: 'done' | 'partial', habit_id = 'h'): CompletionRow => ({
  habit_id,
  completed_at: iso,
  status,
  count,
});

describe('computeHabitStats — consistency', () => {
  it('is done ÷ scheduled over the window', () => {
    // 5-day window (Tue 27 … Sat 31), daily habit, done on 3 → 3/5.
    const stats = computeHabitStats(dailyHabit(), [done('2026-01-29'), done('2026-01-30'), done('2026-01-31')], SAT, 5);
    expect(stats.scheduledDays).toBe(5);
    expect(stats.consistency).toBeCloseTo(3 / 5, 10);
  });

  it('excuses skipped days from BOTH numerator and denominator', () => {
    // 5 scheduled, 1 skipped → denominator 4; 2 done → 2/4 = 0.5, never penalised as a miss.
    const stats = computeHabitStats(dailyHabit(), [done('2026-01-30'), done('2026-01-31'), skip('2026-01-29')], SAT, 5);
    expect(stats.scheduledDays).toBe(4); // the skipped day drops out of the count
    expect(stats.consistency).toBeCloseTo(2 / 4, 10);
  });

  it('gives a count goal partial credit (count ÷ target)', () => {
    // target 4: one day count 2 (credit 0.5), one day done (credit 1) → (0.5 + 1) / 2 = 0.75.
    const habit: ProgressHabit = { ...dailyHabit(), target_count: 4 };
    const stats = computeHabitStats(habit, [countRow('2026-01-30', 2, 'partial'), countRow('2026-01-31', 4, 'done')], SAT, 2);
    expect(stats.consistency).toBeCloseTo(0.75, 10);
  });

  it('is 0 with no history and never divides by zero', () => {
    const stats = computeHabitStats(dailyHabit(), [], SAT, 30);
    expect(stats.consistency).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.bestWeekday).toBeNull();
    expect(stats.toughestWeekday).toBeNull();
  });
});

describe('computeHabitStats — weekday distribution', () => {
  it('buckets completion by the day it was scheduled, counting only scheduled days', () => {
    // 14-day window: both Fridays done (rate 1), one of two Mondays done (rate 0.5), rest 0.
    const stats = computeHabitStats(
      dailyHabit(),
      [done('2026-01-23'), done('2026-01-30'), done('2026-01-19')], // Fri, Fri, Mon
      SAT,
      14,
    );
    for (const w of stats.byWeekday) expect(w.scheduledCount).toBe(2); // 2 of each weekday in the window
    expect(stats.byWeekday[5]!.rate).toBeCloseTo(1, 10); // Fridays
    expect(stats.byWeekday[1]!.rate).toBeCloseTo(0.5, 10); // Mondays (1 of 2)
    expect(stats.byWeekday[0]!.rate).toBe(0); // Sundays — none done
  });

  it('names the strongest weekday, and a genuinely weaker one as toughest', () => {
    const stats = computeHabitStats(dailyHabit(), [done('2026-01-23'), done('2026-01-30'), done('2026-01-19')], SAT, 14);
    expect(stats.bestWeekday).toBe(5); // Friday — the clear high
    expect(stats.toughestWeekday).not.toBeNull();
    expect(stats.byWeekday[stats.toughestWeekday!]!.rate).toBe(0); // a real zero-completion low
  });

  it('has no toughest day when the habit runs on a single weekday', () => {
    // Fridays only (23, 30 in the window), both done.
    const habit: ProgressHabit = { ...dailyHabit(), schedule_days: [5] };
    const stats = computeHabitStats(habit, [done('2026-01-23'), done('2026-01-30')], SAT, 14);
    const active = stats.byWeekday.filter((w) => w.scheduledCount > 0);
    expect(active).toHaveLength(1);
    expect(active[0]!.weekday).toBe(5);
    expect(stats.bestWeekday).toBe(5);
    expect(stats.toughestWeekday).toBeNull(); // one day is not a contrast
  });
});

describe('computeHabitStats — streaks', () => {
  it('counts consecutive done scheduled days ending at today', () => {
    const stats = computeHabitStats(dailyHabit(), [done('2026-01-29'), done('2026-01-30'), done('2026-01-31')], SAT, 5);
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
  });

  it('treats an open today as pending — it never zeroes the streak', () => {
    // Done through yesterday (29, 30); today (31) has no row yet → still open.
    const stats = computeHabitStats(dailyHabit(), [done('2026-01-29'), done('2026-01-30')], SAT, 5);
    expect(stats.currentStreak).toBe(2); // the run through yesterday survives
  });

  it('treats a skipped day as neutral — excused, not a break', () => {
    // done 28, skip 29, done 30, done 31 → an unbroken run of 3 completions.
    const stats = computeHabitStats(
      dailyHabit(),
      [done('2026-01-28'), skip('2026-01-29'), done('2026-01-30'), done('2026-01-31')],
      SAT,
      6,
    );
    expect(stats.currentStreak).toBe(3);
  });

  it('breaks on a past day that missed its target (a partial is not done)', () => {
    // done 26,27,28 (run 3), partial 29 breaks, done 30,31 (run 2). Current 2, longest 3.
    const habit: ProgressHabit = { ...dailyHabit(), target_count: 5 };
    const stats = computeHabitStats(
      habit,
      [countRow('2026-01-26', 5, 'done'), countRow('2026-01-27', 5, 'done'), countRow('2026-01-28', 5, 'done'), countRow('2026-01-29', 2, 'partial'), countRow('2026-01-30', 5, 'done'), countRow('2026-01-31', 5, 'done')],
      SAT,
      6,
    );
    expect(stats.currentStreak).toBe(2);
    expect(stats.longestStreak).toBe(3);
  });
});

describe('computeHabitStats — weekday applicability + trend', () => {
  it('marks a Hijri-scheduled habit as weekday-inapplicable', () => {
    const hijri: ProgressHabit = { ...dailyHabit(), hijri_schedule: { monthDays: [13, 14, 15] } };
    expect(computeHabitStats(hijri, [], SAT).weekdayApplicable).toBe(false);
    expect(computeHabitStats(dailyHabit(), [], SAT).weekdayApplicable).toBe(true);
  });

  it('always samples 12 trend points ending at today', () => {
    const stats = computeHabitStats(dailyHabit(), [done('2026-01-31')], SAT);
    expect(stats.trend).toHaveLength(12);
    expect(stats.trend[stats.trend.length - 1]!.weekEndISO).toBe(SAT);
    for (const p of stats.trend) expect(p.rate).toBeGreaterThanOrEqual(0);
  });
});
