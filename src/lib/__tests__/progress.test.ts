import { describe, expect, it } from '@jest/globals';

import { addDaysISO, daysBetweenISO, HIJRI_MONTHS, hijriMonthRange, hijriParts, scheduledOn } from '@/lib/dates';
import { clamp01, computeProgress, isStackComplete, openUnitsOn, sealableActs, SERIES_MAX_POINTS, tallyDays, toDegrees, withDoneToday, yearMonths, type CompletionRow, type ProgressHabit, type SeriesPoint } from '@/lib/progress';

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

describe('isStackComplete', () => {
  const members = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const set = (...ids: string[]) => new Set(ids);

  it('is true only once every open member is done', () => {
    expect(isStackComplete(members, set('a', 'b'), set())).toBe(false);
    expect(isStackComplete(members, set('a', 'b', 'c'), set())).toBe(true);
  });

  it('treats skipped members as excused, not as blockers', () => {
    // c skipped; a & b done → the stack is complete (skipped drops out of the open set).
    expect(isStackComplete(members, set('a', 'b'), set('c'))).toBe(true);
  });

  it('seals on a single open act — the stack is the unit, however short today’s sequence is', () => {
    expect(isStackComplete(members, set('a'), set('b', 'c'))).toBe(true); // one open, and done
    expect(isStackComplete([{ id: 'a' }], set('a'), set())).toBe(true); // lone member
  });

  it('is false when nothing is open — an all-excused or empty stack has nothing to seal', () => {
    expect(isStackComplete(members, set(), set('a', 'b', 'c'))).toBe(false);
    expect(isStackComplete([], set(), set())).toBe(false);
  });
});

describe('sealableActs', () => {
  const set = (...ids: string[]) => new Set(ids);
  // 2026-07-25 is a Saturday (weekday 6); 2026-07-24 a Friday (5).
  const act = (id: string, stackId: string | null, schedule = [0, 1, 2, 3, 4, 5, 6]) => ({
    id,
    stack_id: stackId,
    created_at: '2026-01-01T00:00:00Z',
    schedule_days: schedule,
    hijri_schedule: null,
  });

  const acts = [
    act('a', 's1'),
    act('b', 's1'),
    act('friday-only', 's1', [5]),
    act('other-stack', 's2'),
    act('temp-123', 's1'),
  ];

  it('takes only the stack’s own acts that are due on the day', () => {
    expect(sealableActs(acts, set(), 's1', '2026-07-25').map((h) => h.id)).toEqual(['a', 'b']);
    // The Friday act joins the sequence on Friday and not otherwise.
    expect(sealableActs(acts, set(), 's1', '2026-07-24').map((h) => h.id)).toEqual(['a', 'b', 'friday-only']);
  });

  it('leaves out excused acts — the seal never asserts something the user excused', () => {
    expect(sealableActs(acts, set('a'), 's1', '2026-07-25').map((h) => h.id)).toEqual(['b']);
  });

  it('leaves out rows whose insert is still in flight (no persisted id to write against)', () => {
    expect(sealableActs(acts, set(), 's1', '2026-07-25').some((h) => h.id.startsWith('temp-'))).toBe(false);
  });

  it('is empty for a stack with nothing due — the card has nothing to seal', () => {
    expect(sealableActs(acts, set(), 'no-such-stack', '2026-07-25')).toEqual([]);
  });
});

describe('openUnitsOn', () => {
  const set = (...ids: string[]) => new Set(ids);
  const DAY = '2026-07-25'; // a Saturday
  const act = (id: string, stackId: string | null, schedule = [0, 1, 2, 3, 4, 5, 6]) => ({
    id,
    stack_id: stackId,
    created_at: '2026-01-01T00:00:00Z',
    schedule_days: schedule,
    hijri_schedule: null,
  });

  // The point of the whole function: a morning of five acts is ONE thing to do.
  it('counts a stack once, however many acts it holds', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => act(id, 's1'));
    expect(openUnitsOn(five, set(), set(), DAY)).toBe(1);
  });

  it('stops counting a stack once it is sealed', () => {
    const two = [act('a', 's1'), act('b', 's1')];
    expect(openUnitsOn(two, set('a'), set(), DAY)).toBe(1); // half-sealed is still outstanding
    expect(openUnitsOn(two, set('a', 'b'), set(), DAY)).toBe(0);
  });

  it('does not count a stack whose acts are all excused', () => {
    const two = [act('a', 's1'), act('b', 's1')];
    expect(openUnitsOn(two, set(), set('a', 'b'), DAY)).toBe(0);
  });

  it('counts each stackless row for itself — an exchange, or a legacy unanchored act', () => {
    expect(openUnitsOn([act('x', null), act('y', null)], set(), set(), DAY)).toBe(2);
    expect(openUnitsOn([act('x', null), act('y', null)], set('x'), set(), DAY)).toBe(1);
  });

  it('adds up across stacks and loose rows', () => {
    const rows = [act('a', 's1'), act('b', 's1'), act('c', 's2'), act('x', null)];
    expect(openUnitsOn(rows, set(), set(), DAY)).toBe(3);
  });

  it('ignores what isn’t due today, and rows still being inserted', () => {
    const rows = [act('friday', 's1', [5]), act('temp-1', 's2')];
    expect(openUnitsOn(rows, set(), set(), DAY)).toBe(0);
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

/**
 * A habit scheduled on ONE Hijri day of the month. With only these in play, the month's whole
 * possible is exactly the habits due on that day — so `thisRate` reads back that single day's
 * fraction, which is how the day-level completion rule is asserted now that the per-day grid is
 * gone from both the screen and the math.
 */
const oneDayHabit = (id: string, monthDay: number): ProgressHabit => ({
  id,
  created_at: null,
  schedule_days: [],
  hijri_schedule: { monthDays: [monthDay] },
});

/** A White-Days habit (13th–15th of every Hijri month) — exercises the Hijri-schedule path. */
const whiteDaysHabit = (id: string): ProgressHabit => ({
  id,
  created_at: null,
  schedule_days: [],
  hijri_schedule: { monthDays: [13, 14, 15] },
});

const done = (habit_id: string, completed_at: string): CompletionRow => ({ habit_id, completed_at, status: 'done', count: null });
const skip = (habit_id: string, completed_at: string): CompletionRow => ({ habit_id, completed_at, status: 'skipped', count: null });

/** A count-goal habit (scheduled every day) with a numeric daily target. */
const countHabit = (id: string, target: number): ProgressHabit => ({
  id,
  created_at: null,
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  hijri_schedule: null,
  target_count: target,
});
/** A count-goal completion row: `status` 'partial' while in progress, 'done' once at target. */
const countRow = (habit_id: string, completed_at: string, count: number, status: 'done' | 'partial'): CompletionRow => ({
  habit_id,
  completed_at,
  status,
  count,
});

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

  describe("a day's completion = done ÷ scheduled, with excused acts removed", () => {
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
        const habits = Array.from({ length: total }, (_, i) => oneDayHabit(`h${i}`, dom));
        const comps: CompletionRow[] = [];
        for (let i = 0; i < doneCount; i += 1) comps.push(done(`h${i}`, today));
        for (let i = 0; i < skipCount; i += 1) comps.push(skip(`h${doneCount + i}`, today));
        // Everything is due on this one day, so the month's rate IS the day's fraction.
        expect(computeProgress(habits, comps, today).month!.thisRate).toBeCloseTo(expected, 10);
      },
    );
  });

  describe('ticking yesterday closes yesterday\'s ring (backfill)', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(start, 5); // day 6
    const yesterday = addDaysISO(today, -1); // day 5

    it('a completion is credited to the day it is dated, not to today', () => {
      // Due on yesterday's Hijri day alone: a row dated yesterday closes the month, and the same
      // row dated today closes nothing — the two halves of "backfill lands where you put it".
      const habit = oneDayHabit('a', monthShape(yesterday).dayOfMonth);
      expect(computeProgress([habit], [done('a', yesterday)], today).month!.thisRate).toBe(1);
      expect(computeProgress([habit], [done('a', today)], today).month!.thisRate).toBe(0);
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

    // Shape: Hijri months are only ever 29 or 30 days.
    expect([29, 30]).toContain(length);

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

// ── The orbit starts the day you do ───────────────────────────────────────────────────────────
// The month is owed only from the day an act was added. Someone who begins partway through is
// measured over what is left, so keeping every act from that day on still closes the full orbit on
// the last day, whichever day they began.
describe('computeProgress — a month begun partway through', () => {
  // One 30-day and one 29-day month, so both lengths are covered.
  const months = ['2026-06-15', '2026-07-15'].map(monthShape);

  it('covers both month lengths', () => {
    expect(new Set(months.map((m) => m.length))).toEqual(new Set([29, 30]));
  });

  for (const { start, length } of months) {
    it.each(Array.from({ length }, (_, i) => i))(`month of ${start}: begun on day %i+1, kept to the end, is 360°`, (offset) => {
      const begun = addDaysISO(start, offset);
      // Local noon, so the creation day is `begun` in any test-runner timezone.
      const habit: ProgressHabit = { ...dailyHabit('daily'), created_at: `${begun}T12:00:00` };
      const remaining = length - offset;
      const completions: CompletionRow[] = [];
      for (let d = begun, kept = 1; kept <= remaining; d = addDaysISO(d, 1), kept += 1) {
        completions.push(done('daily', d));
        const rate = computeProgress([habit], completions, d).month!.thisRate;
        // Each kept day is one share of the days that were left, never of the whole month…
        expect(rate).toBeCloseTo(kept / remaining, 10);
        // …so the orbit closes on the last day and not a day before.
        if (kept < remaining) expect(toDegrees(rate)).toBeLessThan(360);
        else expect(toDegrees(rate)).toBe(360);
      }
    });
  }
});

// ── Your usual: where you normally are by this point in a month ───────────────────────────────
// The caret outside the ring's rim. Same scale as `thisRate` (both are fractions of a whole
// month's possible), because the two are read against each other on one ring. It replaced a
// single sample — last month alone — which `previousRate` still carries for the copy that says
// "last month" in words; the two are cut from the same walk so they can never be measured
// differently.
describe('computeProgress — averageRate', () => {
  it('has nothing to average in a first month, and hides the caret', () => {
    const { start } = monthShape('2026-06-15');
    const born = { ...dailyHabit('daily'), created_at: start }; // nothing exists before this month
    const m = computeProgress([born], [], addDaysISO(start, 5)).month!;
    expect(m.monthsAveraged).toBe(0);
    expect(m.averageRate).toBe(0);
    expect(m.hasPrevious).toBe(false);
  });

  it('with one month behind you, the average IS that month', () => {
    const { start } = monthShape('2026-06-15');
    const prev = hijriMonthRange(addDaysISO(start, -1))!;
    const born = { ...dailyHabit('daily'), created_at: prev.start };
    const completions = [done('daily', prev.start), done('daily', addDaysISO(prev.start, 1))];
    const m = computeProgress([born], completions, addDaysISO(start, 4)).month!;
    expect(m.monthsAveraged).toBe(1);
    expect(m.averageRate).toBeCloseTo(2 / prev.length, 10);
    expect(m.averageRate).toBeCloseTo(m.previousRate, 10); // degenerate, and deliberately so
  });

  it('is the plain mean of the months on record — one strong month does not become the benchmark', () => {
    const { start } = monthShape('2026-06-15');
    const prev = hijriMonthRange(addDaysISO(start, -1))!;
    const older = hijriMonthRange(addDaysISO(prev.start, -1))!;
    const born = { ...dailyHabit('daily'), created_at: older.start };
    // The older month kept in full, last month not at all.
    const completions: CompletionRow[] = [];
    for (let d = older.start; d <= older.end; d = addDaysISO(d, 1)) completions.push(done('daily', d));

    const today = addDaysISO(start, 4); // day 5
    const m = computeProgress([born], completions, today).month!;
    expect(m.monthsAveraged).toBe(2);
    // Each month measured through the matching day over ITS own whole possible, then averaged.
    expect(m.averageRate).toBeCloseTo((0 + 5 / older.length) / 2, 10);
    // …and the newest of the same walk is still last month alone, which read 0.
    expect(m.previousRate).toBe(0);
  });

  it('measures a prior month through the MATCHING day, clamped to that month’s length', () => {
    // A 30th does not exist in a 29-day month; on such a day the whole prior month is what counts.
    for (const today of SWEEP) {
      const { start, dayOfMonth } = monthShape(today);
      const prev = hijriMonthRange(addDaysISO(start, -1))!;
      const completions: CompletionRow[] = [];
      for (let d = prev.start; d <= prev.end; d = addDaysISO(d, 1)) completions.push(done('daily', d));
      const m = computeProgress([dailyHabit('daily')], completions, today).month!;
      expect(m.previousRate).toBeCloseTo(Math.min(dayOfMonth, prev.length) / prev.length, 10);
    }
  });

  it('stops at the first month that was never tracked, rather than averaging in zeroes', () => {
    const { start } = monthShape('2026-06-15');
    const prev = hijriMonthRange(addDaysISO(start, -1))!;
    const born = { ...dailyHabit('daily'), created_at: prev.start };
    expect(computeProgress([born], [], addDaysISO(start, 4)).month!.monthsAveraged).toBe(1);
  });

  it('looks back at most a Hijri year, however long the record is', () => {
    // `created_at: null` means the habit was always scheduled, so only the bound stops the walk.
    const m = computeProgress([dailyHabit('daily')], [], '2026-06-15').month!;
    expect(m.monthsAveraged).toBe(12);
  });

  it.each(SWEEP)('%s: sits on the same 0–1 orbit scale as the headline', (today) => {
    const m = computeProgress([dailyHabit('daily'), whiteDaysHabit('white')], [], today).month!;
    expect(m.averageRate).toBeGreaterThanOrEqual(0);
    expect(m.averageRate).toBeLessThanOrEqual(1);
  });
});


// ── The record as one line ─────────────────────────────────────────────────────────────────────
// The chart has no scale to choose: the bucket width follows the length of the record, so the
// resolution has to change *continuously* — a jump would be exactly the seam a Days/Months/Years
// control makes you feel, arriving on its own.
describe('computeProgress — the record series', () => {
  const today = '2026-06-15';
  /** A daily habit that came into existence `daysAgo` before `today`. */
  const bornDaysAgo = (id: string, daysAgo: number): ProgressHabit => ({
    ...dailyHabit(id),
    created_at: `${addDaysISO(today, -daysAgo)}T09:00:00.000Z`,
  });

  it('opens where the record does, and ends on today', () => {
    const { seriesByPeriod: { life: series } } = computeProgress([bornDaysAgo('h', 9)], [], today);
    expect(series.points).toHaveLength(10);
    expect(series.points[0]!.iso).toBe(addDaysISO(today, -9));
    expect(series.points[series.points.length - 1]!.endISO).toBe(today);
  });

  it('draws day by day while the record is short', () => {
    const { seriesByPeriod: { life: series } } = computeProgress([bornDaysAgo('h', 20)], [], today);
    expect(series.bucketDays).toBe(1);
    expect(series.points.every((p) => p.iso === p.endISO)).toBe(true);
  });

  it('never exceeds the point ceiling, however long the record runs', () => {
    for (const daysAgo of [SERIES_MAX_POINTS, SERIES_MAX_POINTS * 3, 1200, 4000]) {
      const { seriesByPeriod: { life: series } } = computeProgress([bornDaysAgo('h', daysAgo)], [], today);
      expect(series.points.length).toBeLessThanOrEqual(SERIES_MAX_POINTS);
    }
  });

  it('widens by degrees rather than jumping between grains', () => {
    // Bucket width must be monotonic and step by ONE day at a time as the record grows — that
    // gradualness is the whole reason there is no scale control to notice.
    let previous = 0;
    for (let daysAgo = 1; daysAgo < SERIES_MAX_POINTS * 4; daysAgo += 1) {
      const { bucketDays } = computeProgress([bornDaysAgo('h', daysAgo)], [], today).seriesByPeriod.life;
      expect(bucketDays).toBeGreaterThanOrEqual(previous);
      expect(bucketDays - previous).toBeLessThanOrEqual(1);
      previous = bucketDays;
    }
  });

  it('lays buckets back from today, so the newest is whole and any short one is oldest', () => {
    const { seriesByPeriod: { life: series } } = computeProgress([bornDaysAgo('h', SERIES_MAX_POINTS * 2)], [], today);
    const last = series.points[series.points.length - 1]!;
    expect(last.endISO).toBe(today);
    expect(daysBetweenISO(last.iso, last.endISO) + 1).toBe(series.bucketDays);
    // Only the oldest may be clipped by the record's start.
    for (const p of series.points.slice(1)) {
      expect(daysBetweenISO(p.iso, p.endISO) + 1).toBe(series.bucketDays);
    }
  });

  it('marks the bucket containing today, and only that one, as still being lived', () => {
    const { seriesByPeriod: { life: series } } = computeProgress([bornDaysAgo('h', 200)], [], today);
    expect(series.points.filter((p) => p.pending)).toHaveLength(1);
    expect(series.points[series.points.length - 1]!.pending).toBe(true);
  });

  it("reads a bucket against its own schedule — one of two acts done is that day's half", () => {
    const habits = [bornDaysAgo('a', 5), bornDaysAgo('b', 5)];
    const { seriesByPeriod: { life: series } } = computeProgress(habits, [done('a', today)], today);
    expect(series.points[series.points.length - 1]).toMatchObject({ rate: 0.5, possible: 2 });
  });

  // The line must reach the left edge of its plot. It is drawn through the buckets that carry a
  // reading, so if the record opens with days that asked nothing, the curve starts inset and hangs
  // short — with nothing to tell you the emptiness was the point.
  it('opens where the record first asked something, not where a habit was created', () => {
    const { start } = monthShape(today);
    // Created on the 1st, but scheduled only on the White Days: the 13th is the first real day.
    const habit: ProgressHabit = { ...whiteDaysHabit('w'), created_at: `${start}T09:00:00.000Z` };
    const { seriesByPeriod: { life: series } } = computeProgress([habit], [], addDaysISO(start, 20));
    expect(series.points[0]!.possible).toBeGreaterThan(0);
    expect(series.points[0]!.iso).toBe(addDaysISO(start, 12)); // the 13th
  });

  it('has nothing to draw when the record has not asked anything yet', () => {
    const { start } = monthShape(today);
    const habit: ProgressHabit = { ...whiteDaysHabit('w'), created_at: `${start}T09:00:00.000Z` };
    const { seriesByPeriod: { life: series } } = computeProgress([habit], [], addDaysISO(start, 11)); // before the 13th
    expect(series.points).toHaveLength(0);
  });

  it('keeps a gap in the middle — a day nothing was due is not a miss', () => {
    const { start } = monthShape(today);
    const habit: ProgressHabit = { ...whiteDaysHabit('w'), created_at: `${start}T09:00:00.000Z` };
    const { seriesByPeriod: { life: series } } = computeProgress([habit], [], addDaysISO(start, 20));
    // The 16th onward asked nothing, and those slots stay in the series carrying no signal.
    expect(series.points.some((p) => p.possible === 0)).toBe(true);
  });

  it('excuses a skipped day out of the reading entirely', () => {
    const yesterday = addDaysISO(today, -1);
    const habits = [bornDaysAgo('a', 5), bornDaysAgo('b', 5)];
    const { seriesByPeriod: { life: series } } = computeProgress(habits, [skip('a', yesterday), done('b', yesterday)], today);
    // 'a' is excused, so the day is one act of one — a full day, not a half.
    expect(series.points.find((p) => p.endISO === yesterday)).toMatchObject({ possible: 1, rate: 1 });
  });

  it('gives a count goal its partial credit', () => {
    const habit: ProgressHabit = { ...countHabit('c', 4), created_at: `${addDaysISO(today, -3)}T09:00:00.000Z` };
    const { seriesByPeriod: { life: series } } = computeProgress([habit], [countRow('c', today, 1, 'partial')], today);
    expect(series.points[series.points.length - 1]!.rate).toBeCloseTo(0.25, 10);
  });

  it('is empty before anything was ever scheduled', () => {
    const { seriesByPeriod: { life: series } } = computeProgress([], [], today);
    expect(series.points).toHaveLength(0);
  });

  it('agrees with the month above it — the same days, tallied the same way', () => {
    // A point can never disagree with the ring it sits under: both come from one sweep.
    const { start } = monthShape(today);
    const habit: ProgressHabit = { ...dailyHabit('daily'), created_at: `${start}T09:00:00.000Z` };
    const comps = [done('daily', start), done('daily', addDaysISO(start, 1))];
    const { seriesByPeriod: { life: series }, month } = computeProgress([habit], comps, today);
    expect(series.bucketDays).toBe(1); // a month of record is still drawn day by day
    const inMonth = series.points.filter((p) => p.iso >= start && p.iso <= today);
    const doneSum = inMonth.reduce((n, p) => n + p.rate * p.possible, 0);
    expect(doneSum / month!.monthLength).toBeCloseTo(month!.thisRate, 10);
  });
});

describe('computeProgress — the record over each period', () => {
  const today = '2026-06-15';
  const bornDaysAgo = (id: string, daysAgo: number): ProgressHabit => ({
    ...dailyHabit(id),
    created_at: `${addDaysISO(today, -daysAgo)}T09:00:00.000Z`,
  });
  /** A record long enough for every period to be distinct: three Hijri years. */
  const mature = (id: string) => bornDaysAgo(id, 355 * 3);

  it('shows the year from the first day, beside the record', () => {
    // The year is the context for the moon above it, so it does not wait for months to compare.
    for (const daysAgo of [0, 4, 40]) {
      expect(computeProgress([bornDaysAgo('h', daysAgo)], [], today).seriesPeriods).toEqual(['year', 'life']);
    }
  });

  it('never returns an empty list of periods — there is always the record itself', () => {
    for (const habits of [[], [bornDaysAgo('h', 0)], [mature('h')]]) {
      expect(computeProgress(habits, [], today).seriesPeriods).toContain('life');
    }
  });

  it('frames the year as all twelve months from Muḥarram, however recently the record began', () => {
    const { seriesByPeriod } = computeProgress([bornDaysAgo('h', 4)], [], today);
    const year = seriesByPeriod.year;
    expect(year.slots).toBe(12);
    expect(hijriParts(year.points[0]!.iso)).toMatchObject({ day: 1, month: 1 });
    // The months before you began are slots that asked nothing, not misses.
    expect(year.points.slice(0, -1).every((p) => p.possible === 0)).toBe(true);
    // The lifetime has no end to frame, so its width is just what has been lived.
    expect(seriesByPeriod.life.slots).toBe(seriesByPeriod.life.points.length);
  });

  it("reads this month on the year at the moon's own figure, not its rate so far", () => {
    const { start } = monthShape(today);
    const midMonth = addDaysISO(start, 13); // `today` is a month's last day, where the two agree
    const habit: ProgressHabit = { ...dailyHabit('daily'), created_at: `${addDaysISO(start, -200)}T09:00:00.000Z` };
    const comps: CompletionRow[] = [];
    for (let d = start; d <= midMonth; d = addDaysISO(d, 1)) comps.push(done('daily', d));
    const { seriesByPeriod, month } = computeProgress([habit], comps, midMonth);
    const running = seriesByPeriod.year.points[seriesByPeriod.year.points.length - 1]!;
    expect(running.pending).toBe(true);
    expect(running.rate).toBeCloseTo(month!.thisRate, 10);
    // Kept perfectly so far, which the moon reads as part of an orbit and never as a full one.
    expect(running.rate).toBeLessThan(1);
  });

  it('reads a finished month on the year where its own orbit closed', () => {
    const { start } = monthShape(today);
    const lastDay = addDaysISO(start, -1); // the final day of the month before this one
    const habit: ProgressHabit = { ...dailyHabit('daily'), created_at: `${addDaysISO(start, -200)}T09:00:00.000Z` };
    const comps: CompletionRow[] = [];
    for (let d = addDaysISO(lastDay, -9); d <= lastDay; d = addDaysISO(d, 1)) comps.push(done('daily', d));
    const closedOn = computeProgress([habit], comps, lastDay).month!.thisRate;
    const year = computeProgress([habit], comps, today).seriesByPeriod.year;
    const finished = year.points[year.points.length - 2]!;
    expect(finished.endISO).toBe(lastDay);
    expect(finished.rate).toBeCloseTo(closedOn, 10);
  });

  it('reads the year as twelve months: quiet before the record, this one running, the rest ahead', () => {
    const day = addDaysISO(today, -200); // mid-year, so there are months on both sides of it
    const habit: ProgressHabit = { ...dailyHabit('h'), created_at: `${monthShape(day).start}T09:00:00.000Z` };
    const months = yearMonths(computeProgress([habit], [], day).seriesByPeriod.year);
    const now = hijriParts(day)!.month - 1;
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThan(11);
    expect(months.map((m) => m.name)).toEqual([...HIJRI_MONTHS]);
    expect(months[now]).toMatchObject({ phase: 'running', rate: 0, kept: false });
    // The months before you began asked nothing: no orbit, not an empty one.
    expect(months.slice(0, now).every((m) => m.phase === 'quiet' && m.rate === null)).toBe(true);
    expect(months.slice(now + 1).every((m) => m.phase === 'ahead' && m.rate === null)).toBe(true);
  });

  it('reads a month kept in full as kept, and one owed but missed as closed at 0°, never as quiet', () => {
    const { start } = monthShape(today);
    const lastMonth = monthShape(addDaysISO(start, -1));
    const habit: ProgressHabit = { ...dailyHabit('daily'), created_at: `${addDaysISO(start, -200)}T09:00:00.000Z` };
    const comps: CompletionRow[] = [];
    for (let d = lastMonth.start; d <= lastMonth.end; d = addDaysISO(d, 1)) comps.push(done('daily', d));
    const months = yearMonths(computeProgress([habit], comps, today).seriesByPeriod.year);
    const now = hijriParts(today)!.month - 1;
    expect(now).toBeGreaterThan(1);
    expect(months[now]!.phase).toBe('running');
    expect(months[now - 1]).toMatchObject({ phase: 'closed', rate: 1, kept: true });
    expect(months[now - 2]).toMatchObject({ phase: 'closed', rate: 0, kept: false });
  });

  it('calls a month kept only at a rate of 1, never at one that merely rounds to 360°', () => {
    // 0.9995 rounds to 360 in whole degrees, but `orbitDegrees` reads it as 359° and the hero ring
    // stays open, so the Year mark must not close warm on it either.
    const point = (rate: number) =>
      ({ iso: '2026-01-01', endISO: '2026-01-29', rate, possible: 30, pending: false }) as SeriesPoint;
    const months = yearMonths({ points: [point(0.9995), point(1)], bucketDays: 0, slots: 12 });
    expect(months[0]).toMatchObject({ phase: 'closed', kept: false });
    expect(months[1]).toMatchObject({ phase: 'closed', kept: true });
  });

  it('reads a year as its Hijri months, tiled exactly and clipped at today', () => {
    const { seriesByPeriod } = computeProgress([mature('h')], [], today);
    const year = seriesByPeriod.year;
    expect(year.bucketDays).toBe(0); // a Hijri month has no fixed width
    const { start: monthStart } = monthShape(today);
    expect(year.points[year.points.length - 1]).toMatchObject({ iso: monthStart, endISO: today });
    // Each bucket is one whole Hijri month, and they meet end-to-start with no gap or overlap.
    for (const [i, p] of year.points.entries()) {
      expect(hijriMonthRange(p.iso)!.start).toBe(p.iso);
      if (i > 0) expect(p.iso).toBe(addDaysISO(year.points[i - 1]!.endISO, 1));
      if (i < year.points.length - 1) expect(p.endISO).toBe(hijriMonthRange(p.iso)!.end);
    }
  });

  it('ends every period on today, with exactly one bucket still being lived', () => {
    const derived = computeProgress([mature('h')], [], today);
    for (const period of ['year', 'life'] as const) {
      const { points } = derived.seriesByPeriod[period];
      expect(points[points.length - 1]!.endISO).toBe(today);
      expect(points.filter((p) => p.pending)).toHaveLength(1);
    }
  });

  it('holds its invariants across a year of months', () => {
    // Both born well before the sweep opens, so every day of it has a real record behind it.
    const born = `${addDaysISO(SWEEP[0]!, -400)}T09:00:00.000Z`;
    const habits = [
      { ...dailyHabit('daily'), created_at: born },
      { ...whiteDaysHabit('white'), created_at: born },
    ];
    for (const day of SWEEP) {
      const derived = computeProgress(habits, [], day);
      expect(derived.seriesPeriods).toEqual(['year', 'life']);
      expect(derived.seriesByPeriod.year.slots).toBe(12);
      for (const period of derived.seriesPeriods) {
        const { points } = derived.seriesByPeriod[period];
        expect(points.length).toBeLessThanOrEqual(SERIES_MAX_POINTS);
        expect(points[points.length - 1]!.endISO).toBe(day);
      }
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
  });

  it('a day with no scheduled act contributes nothing either way', () => {
    // Done on the 1st, where the White-Days habit isn't due: the rate stays at zero, so an
    // unscheduled day can neither earn credit nor dilute it.
    const m = computeProgress([whiteDaysHabit('w')], [done('w', start)], today).month!;
    expect(m.thisRate).toBe(0);
  });

  it('only the 13th done → whole-month rate is 1/3', () => {
    const m = computeProgress([whiteDaysHabit('w')], [done('w', addDaysISO(start, 12))], today).month!;
    expect(m.thisRate).toBeCloseTo(1 / 3, 10); // the other two White Days are scheduled but unmet
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

// ── Count goals: a scheduled day earns count ÷ target (partial credit), not just 0/1 ─────────
describe('computeProgress — count goals earn partial credit', () => {
  const start = monthShape('2026-06-15').start;
  const today = addDaysISO(start, 5); // day 6, mid-month → an unambiguous 'today' cell
  const dom = monthShape(today).dayOfMonth;

  /** A count goal due on today's Hijri day alone, so the month's rate is that day's credit. */
  const countToday = (target: number) => ({ ...countHabit('c', target), schedule_days: [], hijri_schedule: { monthDays: [dom] } });
  const rateToday = (habits: ProgressHabit[], comps: CompletionRow[]) =>
    computeProgress(habits, comps, today).month!.thisRate;

  it("a partial count (3 of 5) earns 3/5 of that day's credit", () => {
    expect(rateToday([countToday(5)], [countRow('c', today, 3, 'partial')])).toBeCloseTo(3 / 5, 10);
  });

  it('reaching the target earns full credit (1)', () => {
    expect(rateToday([countToday(5)], [countRow('c', today, 5, 'done')])).toBe(1);
  });

  it('no row → no credit (0)', () => {
    expect(rateToday([countToday(5)], [])).toBe(0);
  });

  it('a count beyond the target never exceeds full credit', () => {
    expect(rateToday([countToday(5)], [countRow('c', today, 99, 'done')])).toBe(1);
  });

  it("mixes with a binary habit as the average of the two acts' credit", () => {
    // binary done (credit 1) + count goal 1 of 4 (credit 0.25) → the day = (1 + 0.25) / 2.
    const rate = rateToday(
      [oneDayHabit('b', dom), countToday(4)],
      [done('b', today), countRow('c', today, 1, 'partial')],
    );
    expect(rate).toBeCloseTo((1 + 0.25) / 2, 10);
  });

  it('a partial count feeds the whole-month ring proportionally', () => {
    // One daily count goal (target 4) with 2 logged today and nothing else this month:
    // month-to-date credit = 0.5 (today only), whole-month possible = `length` scheduled days.
    const { length } = monthShape(today);
    const m = computeProgress([countHabit('c', 4)], [countRow('c', today, 2, 'partial')], today).month!;
    expect(m.thisRate).toBeCloseTo(0.5 / length, 10);
  });

  it('a skipped count goal leaves the rate entirely (excused, like a binary skip)', () => {
    // Skip the count goal on a 2-act day → the day reads off the other (done) act only.
    const rate = rateToday([oneDayHabit('b', dom), countToday(4)], [done('b', today), skip('c', today)]);
    expect(rate).toBe(1); // 'c' excused → 1 of 1 remaining
  });
});

describe('withDoneToday (overlay optimistic-done overlay)', () => {
  const DAY = '2026-07-11';

  it('is a no-op (same reference) when no ids are given', () => {
    const rows: CompletionRow[] = [{ habit_id: 'a', completed_at: DAY, status: 'done', count: null }];
    expect(withDoneToday(rows, [], DAY)).toBe(rows);
  });

  it('injects a done row for an id the server fetch is still missing', () => {
    expect(withDoneToday([], ['a'], DAY)).toEqual([{ habit_id: 'a', completed_at: DAY, status: 'done', count: null }]);
  });

  it('upgrades an existing partial/count row for the day to done (a count goal that closed the day)', () => {
    const rows: CompletionRow[] = [{ habit_id: 'a', completed_at: DAY, status: 'partial', count: 2 }];
    expect(withDoneToday(rows, ['a'], DAY)).toEqual([{ habit_id: 'a', completed_at: DAY, status: 'done', count: null }]);
  });

  it('leaves other days and other habits untouched', () => {
    const otherDay: CompletionRow = { habit_id: 'a', completed_at: '2026-07-10', status: 'done', count: null };
    const otherHabit: CompletionRow = { habit_id: 'b', completed_at: DAY, status: 'done', count: null };
    const out = withDoneToday([otherDay, otherHabit], ['a'], DAY);
    expect(out).toContainEqual(otherDay);
    expect(out).toContainEqual(otherHabit);
    expect(out).toContainEqual({ habit_id: 'a', completed_at: DAY, status: 'done', count: null });
  });

  it('closes the stale-read gap: overlaying the last unpersisted tick equals the fully-persisted read', () => {
    const habits: ProgressHabit[] = [
      { id: 'a', created_at: null, schedule_days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'b', created_at: null, schedule_days: [0, 1, 2, 3, 4, 5, 6] },
    ];
    const persisted: CompletionRow[] = [
      { habit_id: 'a', completed_at: DAY, status: 'done', count: null },
      { habit_id: 'b', completed_at: DAY, status: 'done', count: null },
    ];
    const stale = persisted.slice(0, 1); // 'b' hasn't reached the server yet
    const full = computeProgress(habits, persisted, DAY).month?.thisRate;
    const staleRate = computeProgress(habits, stale, DAY).month?.thisRate;
    const overlaid = computeProgress(habits, withDoneToday(stale, ['a', 'b'], DAY), DAY).month?.thisRate;
    expect(staleRate).toBeLessThan(full ?? 0); // proves the race undercounts
    expect(overlaid).toBe(full); // the overlay overlay closes it
  });
});

// ── tallyDays: each day's own orbit, for the week bar and the calendar ──────

describe('tallyDays', () => {
  // 2026-10-17 is a Saturday: the week bar's first day.
  const SAT = '2026-10-17';
  const SUN = '2026-10-18';
  const FRI = '2026-10-23';

  it('owes each day its scheduled acts and credits what was kept', () => {
    const days = tallyDays([dailyHabit('a'), dailyHabit('b')], [done('a', SAT), done('b', SAT), done('a', SUN)], SAT, SUN);
    expect(days.get(SAT)).toEqual({ done: 2, possible: 2 });
    expect(days.get(SUN)).toEqual({ done: 1, possible: 2 });
  });

  it('asks nothing of a day nothing is scheduled on', () => {
    const jumuah: ProgressHabit = { id: 'j', created_at: null, schedule_days: [5], hijri_schedule: null };
    const days = tallyDays([jumuah], [done('j', FRI)], SAT, FRI);
    expect(days.get(SAT)).toEqual({ done: 0, possible: 0 });
    expect(days.get(FRI)).toEqual({ done: 1, possible: 1 });
    expect(days.size).toBe(7);
  });

  it('drops an excused act from both sides, and owes nothing before an act existed', () => {
    const later: ProgressHabit = { ...dailyHabit('late'), created_at: `${SUN}T09:00:00Z` };
    const days = tallyDays([dailyHabit('a'), later], [skip('a', SAT), done('late', SUN)], SAT, SUN);
    expect(days.get(SAT)).toEqual({ done: 0, possible: 0 }); // excused, and `late` didn't exist yet
    expect(days.get(SUN)).toEqual({ done: 1, possible: 2 });
  });

  it('gives a count goal its share of the day', () => {
    const days = tallyDays([countHabit('pages', 4)], [countRow('pages', SAT, 1, 'partial')], SAT, SAT);
    expect(days.get(SAT)).toEqual({ done: 0.25, possible: 1 });
  });

  it('adds up to the month the moon is filled with', () => {
    // The week bar and the Progress orbit read the same rule, so a month of day orbits sums to the
    // month's own: the days kept so far over everything the whole month asks.
    const today = '2026-10-21';
    const { start, end } = monthShape(today);
    const habits = [dailyHabit('a'), countHabit('n', 3)];
    const rows = [done('a', start), countRow('n', start, 2, 'partial'), done('a', addDaysISO(start, 1)), skip('n', addDaysISO(start, 1))];
    const days = tallyDays(habits, rows, start, end);
    let kept = 0;
    let possible = 0;
    for (const [day, tally] of days) {
      possible += tally.possible;
      if (day <= today) kept += tally.done;
    }
    expect(kept / possible).toBeCloseTo(computeProgress(habits, rows, today).month!.thisRate, 10);
  });
});
