import { describe, expect, it } from '@jest/globals';

import { addDaysISO, hijriMonthRange, hijriParts, scheduledOn } from '@/lib/dates';
import { clamp01, computeProgress, toDegrees, type CompletionRow, type ProgressHabit } from '@/lib/progress';

describe('clamp01', () => {
  it('clamps below 0 and above 1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });

  it('passes through values already in range', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
  });
});

describe('toDegrees', () => {
  it('maps a completion rate to whole orbit degrees', () => {
    expect(toDegrees(0)).toBe(0);
    expect(toDegrees(0.25)).toBe(90);
    expect(toDegrees(0.5)).toBe(180);
    expect(toDegrees(1)).toBe(360);
  });

  it('clamps out-of-range rates', () => {
    expect(toDegrees(-1)).toBe(0);
    expect(toDegrees(2)).toBe(360);
  });
});

// ── computeProgress: the rings users actually see ───────────────────────────
// Expectations are derived from *intended* behaviour ("day 1 of a 30-day month, one
// daily act done → 1/30 of the orbit"), never copied from the current output — so a
// test going red means the code is wrong, not the test.

/** A daily habit (scheduled every weekday), existing for all of history. */
const dailyHabit = (id: string): ProgressHabit => ({
  id,
  created_at: null, // null = creation unknown → never filtered out by `scheduledOn`
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  hijri_schedule: null,
});

/** A White-Days habit (13th–15th of every Hijri month) — exercises the Hijri-schedule path. */
const whiteDaysHabit = (id: string): ProgressHabit => ({
  id,
  created_at: null,
  schedule_days: [],
  hijri_schedule: { monthDays: [13, 14, 15] },
});

const done = (habit_id: string, completed_at: string): CompletionRow => ({ habit_id, completed_at, status: 'done' });
const skip = (habit_id: string, completed_at: string): CompletionRow => ({ habit_id, completed_at, status: 'skipped' });

/** The Hijri shape of a day, read from the already-tested calendar helpers (no hardcoded 29/30). */
function monthShape(today: string) {
  const range = hijriMonthRange(today);
  const parts = hijriParts(today);
  if (!range || !parts) throw new Error('Islamic calendar unavailable in this test environment');
  return { start: range.start, end: range.end, length: range.length, dayOfMonth: parts.day };
}

/**
 * A deterministic spread of "today" values: the 1st, the middle, and the last day of N
 * consecutive Hijri months from a base date. Hits every month boundary and both 29- and
 * 30-day lengths without hardcoding — so the invariants below are checked across a whole
 * year, not one lucky date.
 */
function sweepDays(baseISO: string, months: number): string[] {
  const out: string[] = [];
  let cursor = monthShape(baseISO).start;
  for (let m = 0; m < months; m += 1) {
    const { start, end, length } = monthShape(cursor);
    out.push(start, addDaysISO(start, Math.floor(length / 2)), end);
    cursor = addDaysISO(end, 1); // the 1st of the next Hijri month
  }
  return out;
}

const SWEEP = sweepDays('2026-01-01', 13); // 13 months → a full Hijri year + both month lengths

describe('computeProgress', () => {
  it('sanity: the test runtime has the Umm al-Qura calendar', () => {
    // Every scenario below depends on it; fail loudly here rather than cryptically later.
    expect(hijriMonthRange('2026-06-15')).not.toBeNull();
  });

  describe("a day's cell = done ÷ scheduled, with excused acts removed", () => {
    // A mid-month "today" so 'past'/'today' states are unambiguous.
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(start, 5); // 6th of the Hijri month
    const dom = monthShape(today).dayOfMonth;

    // [total scheduled acts, done, excused (skipped)] → expected cell fraction. Excused acts
    // leave the rate entirely (out of numerator AND denominator) — so an all-excused-or-done day
    // still closes at 1.
    it.each([
      { total: 1, doneCount: 0, skipCount: 0, expected: 0 }, // nothing done → empty
      { total: 1, doneCount: 1, skipCount: 0, expected: 1 }, // the one act done → closed
      { total: 2, doneCount: 1, skipCount: 0, expected: 0.5 }, // half
      { total: 4, doneCount: 3, skipCount: 0, expected: 0.75 }, // three-quarters
      { total: 2, doneCount: 1, skipCount: 1, expected: 1 }, // excused one leaves the rate → 100%
      { total: 3, doneCount: 1, skipCount: 1, expected: 0.5 }, // 1 of (3 − 1 excused) = 2
    ])(
      '$total acts, $doneCount done, $skipCount excused → fraction $expected',
      ({ total, doneCount, skipCount, expected }) => {
        const habits = Array.from({ length: total }, (_, i) => dailyHabit(`h${i}`));
        const comps: CompletionRow[] = [];
        for (let i = 0; i < doneCount; i += 1) comps.push(done(`h${i}`, today));
        for (let i = 0; i < skipCount; i += 1) comps.push(skip(`h${doneCount + i}`, today));
        const cell = computeProgress(habits, comps, today).month!.days[dom - 1]!;
        expect(cell.state).toBe('today');
        expect(cell.fraction).toBeCloseTo(expected, 10);
      },
    );
  });

  describe('ticking yesterday closes yesterday\'s ring (backfill)', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(start, 5); // day 6
    const yesterday = addDaysISO(today, -1); // day 5

    it('a completion dated yesterday fills yesterday\'s cell, leaving today empty', () => {
      const { month } = computeProgress([dailyHabit('a')], [done('a', yesterday)], today);
      const yDay = monthShape(yesterday).dayOfMonth;
      const yCell = month!.days[yDay - 1]!;
      const tCell = month!.days[monthShape(today).dayOfMonth - 1]!;
      expect(yCell.state).toBe('past');
      expect(yCell.fraction).toBe(1);
      expect(tCell.state).toBe('today');
      expect(tCell.fraction).toBe(0);
    });
  });

  describe('month ring reaches the level implied by what you ticked', () => {
    // A genuinely mid-month "today" (10th) — days still remain, so a perfect run so far must
    // be a partial orbit, not 360°. (Picking the month's last day would correctly read 360.)
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(start, 9); // 10th of the Hijri month
    const { length, dayOfMonth } = monthShape(today);

    it('every act done so far → ring is dayOfMonth/monthLength of the orbit (NOT a full 360°)', () => {
      // One daily habit, completed every day from the 1st through today.
      const completions: CompletionRow[] = [];
      for (let day = start; day <= today; day = addDaysISO(day, 1)) completions.push(done('a', day));

      const { month } = computeProgress([dailyHabit('a')], completions, today);
      // Rate = done month-to-date ÷ WHOLE-month possible → dayOfMonth done over `length` scheduled.
      expect(month!.thisRate).toBe(dayOfMonth / length);

      const degrees = toDegrees(month!.thisRate);
      expect(degrees).toBe(Math.round((dayOfMonth / length) * 360));
      expect(degrees).toBeLessThan(360); // days remain → not a complete orbit
    });
  });

  describe('the single-perfect-day case is NOT a full month (the reported bug)', () => {
    // "today" is the 1st of a Hijri month, with that day 100% complete.
    const start = monthShape('2026-06-15').start;
    const today = start;
    const { length, dayOfMonth } = monthShape(today);

    it('one perfect day on the 1st → a small slice, not 360°', () => {
      expect(dayOfMonth).toBe(1); // guard: we really are on the 1st
      const { month } = computeProgress([dailyHabit('a')], [done('a', today)], today);

      // One act done over a WHOLE-month denominator — `1 / length`, not "1 of 1 so far" (the bug).
      expect(month!.thisRate).toBe(1 / length);

      const degrees = toDegrees(month!.thisRate);
      expect(degrees).toBe(Math.round(360 / length)); // ≈12°
      expect(degrees).toBeGreaterThan(0);
      expect(degrees).toBeLessThan(360);
    });
  });

});

// ── Invariant sweeps: properties that must hold for EVERY day, not just lucky dates ──────────
// The reported bug (a perfect early day reading 360°) is one instance of a broken invariant.
// These check the invariants across a whole year of months, so the whole *class* is guarded.

describe('computeProgress — invariants across a year of months', () => {
  it('the sweep itself covers both 29- and 30-day months (guards the test)', () => {
    const lengths = new Set(SWEEP.map((d) => monthShape(d).length));
    expect(lengths.has(29)).toBe(true);
    expect(lengths.has(30)).toBe(true);
  });

  // For every swept day, with a "perfect so far" history (every scheduled act done from the 1st
  // through `today`), across a mixed habit set: a daily act (guarantees something scheduled every
  // remaining day) plus a Hijri-scheduled White-Days act (exercises the Hijri path year-round).
  it.each(SWEEP)('%s: rings stay well-formed and never falsely full', (today) => {
    const { start, length, dayOfMonth } = monthShape(today);
    const habits = [dailyHabit('daily'), whiteDaysHabit('white')];
    const completions: CompletionRow[] = [];
    for (let d = start; d <= today; d = addDaysISO(d, 1))
      for (const h of habits) if (scheduledOn(h, d)) completions.push(done(h.id, d));

    const m = computeProgress(habits, completions, today).month!;

    // Shape: one cell per real day; Hijri months are only ever 29 or 30 days.
    expect(m.days).toHaveLength(length);
    expect([29, 30]).toContain(length);

    // Every per-day cell is a valid fraction; future cells are always empty.
    for (const cell of m.days) {
      expect(cell.fraction).toBeGreaterThanOrEqual(0);
      expect(cell.fraction).toBeLessThanOrEqual(1);
      if (cell.state === 'future') expect(cell.fraction).toBe(0);
    }

    // The whole-month rate is a valid fraction…
    expect(m.thisRate).toBeGreaterThanOrEqual(0);
    expect(m.thisRate).toBeLessThanOrEqual(1);

    // …and a full month is reachable ONLY on the last day (the daily habit guarantees an act on
    // every remaining day). This is the generalised anti-bug guard: perfect-so-far + days left
    // must stay strictly under a complete orbit, never snap to 360°.
    if (dayOfMonth < length) {
      expect(m.thisRate).toBeLessThan(1);
      expect(toDegrees(m.thisRate)).toBeLessThan(360);
    } else {
      expect(m.thisRate).toBe(1);
      expect(toDegrees(m.thisRate)).toBe(360);
    }
  });
});

describe('computeProgress — Hijri-scheduled (White Days) acts count only on the 13th–15th', () => {
  const { start, length } = monthShape('2026-06-15');
  const today = addDaysISO(start, length - 1); // last day → all three White Days are in the window

  it('all three White Days done → whole-month rate is 3/3 (they are the only scheduled acts)', () => {
    const comps = [13, 14, 15].map((d) => done('w', addDaysISO(start, d - 1)));
    const m = computeProgress([whiteDaysHabit('w')], comps, today).month!;
    expect(m.thisRate).toBe(1); // 3 of 3 — a non-daily habit still reaches a full orbit when complete
    expect(m.days[12]!.fraction).toBe(1); // the 13th closed
    expect(m.days[0]!.fraction).toBe(0); // the 1st has no scheduled act → empty cell
  });

  it('only the 13th done → whole-month rate is 1/3', () => {
    const m = computeProgress([whiteDaysHabit('w')], [done('w', addDaysISO(start, 12))], today).month!;
    expect(m.thisRate).toBeCloseTo(1 / 3, 10);
    expect(m.days[12]!.fraction).toBe(1); // 13th done
    expect(m.days[13]!.fraction).toBe(0); // 14th scheduled but not done
  });
});

describe('computeProgress — monotonicity', () => {
  it('completing one more day never lowers the month ring, and a perfect month lands on 360°', () => {
    const { start, length } = monthShape('2026-06-15');
    const today = addDaysISO(start, length - 1); // the month's last day → all days count toward it
    const completions: CompletionRow[] = [];
    let prev = -1;
    for (let i = 0; i < length; i += 1) {
      completions.push(done('a', addDaysISO(start, i)));
      const deg = toDegrees(computeProgress([dailyHabit('a')], completions, today).month!.thisRate);
      expect(deg).toBeGreaterThanOrEqual(prev); // more done → never less filled
      prev = deg;
    }
    expect(prev).toBe(360); // every day of the month done → a complete orbit
  });
});
