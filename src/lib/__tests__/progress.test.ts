import { describe, expect, it } from '@jest/globals';

import { addDaysISO, createdDayISO, hijriMonthRange, hijriParts, hijriYearStart, scheduledOn } from '@/lib/dates';
import { clamp01, computeProgress, DAILY_WINDOW_DAYS, isStackComplete, openUnitsOn, sealableActs, toDegrees, withDoneToday, type CompletionRow, type ProgressHabit, type TrendSummary } from '@/lib/progress';

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

// ── The pace: where the month itself has got to ───────────────────────────────────────────────
// The hero's always-present benchmark. It must be on the SAME scale as `thisRate` (both are
// fractions of the whole month's possible), because the two are drawn as arcs on one ring and
// read against each other — a second scale in the same ° unit is the bug this measure avoids.
describe('computeProgress — paceRate', () => {
  it.each(SWEEP)('%s: you can never be ahead of what the month has asked (thisRate <= paceRate)', (today) => {
    const { start } = monthShape(today);
    const habits = [dailyHabit('daily'), whiteDaysHabit('white'), countHabit('count', 5)];
    // Perfect so far — the strictest case: if the invariant holds when everything is done, the
    // pace is genuinely the ceiling and not merely bigger than a partial score.
    const completions: CompletionRow[] = [];
    for (let d = start; d <= today; d = addDaysISO(d, 1))
      for (const h of habits)
        if (scheduledOn(h, d)) completions.push(h.id === 'count' ? countRow(h.id, d, 5, 'done') : done(h.id, d));

    const m = computeProgress(habits, completions, today).month!;
    expect(m.paceRate).toBeGreaterThanOrEqual(m.thisRate);
    expect(m.paceRate).toBeLessThanOrEqual(1);
  });

  it('a perfect record sits exactly ON the pace — the two arc heads meet', () => {
    const { start } = monthShape('2026-06-15');
    const today = addDaysISO(start, 9); // ten days in, all kept
    const completions: CompletionRow[] = [];
    for (let d = start; d <= today; d = addDaysISO(d, 1)) completions.push(done('daily', d));
    const m = computeProgress([dailyHabit('daily')], completions, today).month!;
    expect(m.thisRate).toBeCloseTo(m.paceRate, 10);
  });

  it('the month closes at a full orbit of pace on its last day', () => {
    const { start, length } = monthShape('2026-06-15');
    const m = computeProgress([dailyHabit('daily')], [], addDaysISO(start, length - 1)).month!;
    expect(m.paceRate).toBe(1);
  });

  it('day one of a month asks for exactly one day of it', () => {
    const { start, length } = monthShape('2026-06-15');
    const m = computeProgress([dailyHabit('daily')], [], start).month!;
    expect(m.paceRate).toBeCloseTo(1 / length, 10);
  });

  it('measures elapsed SCHEDULE, not elapsed days — White Days pace in exact thirds', () => {
    // The only act runs on the 13th–15th, so after the 13th the month has asked for one of its
    // three acts: 1/3 of pace on day 13 of ~30, where a day count would have said ~43%.
    const { start } = monthShape('2026-06-15');
    const m = computeProgress([whiteDaysHabit('w')], [], addDaysISO(start, 12)).month!;
    expect(m.paceRate).toBeCloseTo(1 / 3, 10);
    // …and nothing at all before the 13th, however far into the month it is.
    expect(computeProgress([whiteDaysHabit('w')], [], addDaysISO(start, 11)).month!.paceRate).toBe(0);
  });

  it('an excused day is not asked of you — it leaves the pace as well as the score', () => {
    const { start } = monthShape('2026-06-15');
    const today = addDaysISO(start, 2);
    const bare = computeProgress([dailyHabit('daily')], [], today).month!;
    const excused = computeProgress([dailyHabit('daily')], [skip('daily', addDaysISO(start, 1))], today).month!;
    expect(excused.paceRate).toBeLessThan(bare.paceRate);
  });

  it('is zero when the month asks nothing at all', () => {
    expect(computeProgress([], [], '2026-06-15').month!.paceRate).toBe(0);
  });
});

// ── The daily series: the only scale that moves on a second day ────────────────────────────────
describe('computeProgress — the daily series', () => {
  const today = '2026-06-15';

  it('carries the window, oldest first, ending on today', () => {
    const { daily } = computeProgress([dailyHabit('daily')], [], today);
    expect(daily).toHaveLength(DAILY_WINDOW_DAYS);
    expect(daily[daily.length - 1]!.iso).toBe(today);
    expect(daily[0]!.iso).toBe(addDaysISO(today, -(DAILY_WINDOW_DAYS - 1)));
  });

  it('marks today, and only today, as still running', () => {
    const { daily } = computeProgress([dailyHabit('daily')], [], today);
    expect(daily.filter((p) => p.pending).map((p) => p.iso)).toEqual([today]);
  });

  it("reads a day against its own schedule — one of two acts done is that day's half", () => {
    const comps = [done('a', today)];
    const { daily } = computeProgress([dailyHabit('a'), dailyHabit('b')], comps, today);
    expect(daily[daily.length - 1]).toMatchObject({ rate: 0.5, possible: 2 });
  });

  it('leaves a day nothing was due carrying no signal, rather than a zero', () => {
    // White Days only: the 1st has nothing due, the 13th has one act.
    const { start } = monthShape(today);
    const { daily } = computeProgress([whiteDaysHabit('w')], [], addDaysISO(start, 12));
    const byDay = new Map(daily.map((p) => [p.iso, p]));
    expect(byDay.get(start)).toMatchObject({ possible: 0, rate: 0 });
    expect(byDay.get(addDaysISO(start, 12))).toMatchObject({ possible: 1, rate: 0 });
  });

  it('excuses a skipped day out of the reading entirely', () => {
    const yesterday = addDaysISO(today, -1);
    const { daily } = computeProgress([dailyHabit('a'), dailyHabit('b')], [skip('a', yesterday), done('b', yesterday)], today);
    // 'a' is excused, so the day is one act of one — a full day, not a half.
    expect(daily.find((p) => p.iso === yesterday)).toMatchObject({ possible: 1, rate: 1 });
  });

  it('gives a count goal its partial credit for the day', () => {
    const { daily } = computeProgress([countHabit('c', 4)], [countRow('c', today, 1, 'partial')], today);
    expect(daily[daily.length - 1]!.rate).toBeCloseTo(0.25, 10);
  });

  it('is empty of signal before anything existed — the chart has nothing to draw, not a floor of misses', () => {
    const born = addDaysISO(today, -2);
    const habit: ProgressHabit = { ...dailyHabit('h'), created_at: `${born}T09:00:00.000Z` };
    const { daily } = computeProgress([habit], [], today);
    expect(daily.every((p) => p.iso >= born || p.possible === 0)).toBe(true);
    expect(daily.filter((p) => p.possible > 0)).toHaveLength(3); // born, +1, today
  });

  it('agrees with the month it sits inside — the days of a month sum to its tally', () => {
    // A day can never disagree with the ring above it: both come from the same sweep.
    const { start } = monthShape(today);
    const comps = [done('daily', start), done('daily', addDaysISO(start, 1))];
    const { daily, month } = computeProgress([dailyHabit('daily')], comps, today);
    const inMonth = daily.filter((p) => p.iso >= start && p.iso <= today);
    const doneSum = inMonth.reduce((n, p) => n + p.rate * p.possible, 0);
    expect(doneSum / (month!.monthLength * 1)).toBeCloseTo(month!.thisRate, 10);
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

// ── This life: every Hijri year on record ────────────────────────────────────────────────────
describe('computeProgress — the lifetime years', () => {
  // A habit that has existed since early 2024 — a couple of Hijri years before "today".
  const bornEarly2024 = (id: string): ProgressHabit => ({ ...dailyHabit(id), created_at: '2024-01-05T09:00:00Z' });
  const today = '2026-06-15';

  it('runs from the year the record opens to the year running now, oldest first', () => {
    const { life } = computeProgress([bornEarly2024('a')], [], today);
    const years = life!.years.map((y) => y.year);
    expect(years.length).toBeGreaterThanOrEqual(2);
    // Ascending, contiguous — a life has no gaps in it, even years nothing was kept in.
    expect([...years].sort((x, z) => x - z)).toEqual(years);
    for (let i = 1; i < years.length; i += 1) expect(years[i]).toBe(years[i - 1]! + 1);
    expect(years[years.length - 1]).toBe(hijriYearStart(today)!.year);
  });

  it('marks exactly one year as the one running now — the last', () => {
    const { life } = computeProgress([bornEarly2024('a')], [], today);
    const current = life!.years.filter((y) => y.state === 'current');
    expect(current).toHaveLength(1);
    expect(current[0]!.year).toBe(life!.years[life!.years.length - 1]!.year);
  });

  it('stops at the year before anything was ever scheduled', () => {
    const { life } = computeProgress([bornEarly2024('a')], [], today);
    const opening = hijriParts(createdDayISO('2024-01-05T09:00:00Z'))!.year;
    expect(life!.years[0]!.year).toBe(opening);
  });

  it('a closed year kept in full reads as a complete orbit', () => {
    const habit = bornEarly2024('a');
    // Fill every scheduled day of the year BEFORE the current one.
    const currentStart = hijriYearStart(today)!.start;
    const prevStart = hijriYearStart(addDaysISO(currentStart, -1))!.start;
    const prevEnd = addDaysISO(currentStart, -1);
    const comps: CompletionRow[] = [];
    for (let d = prevStart; d <= prevEnd; d = addDaysISO(d, 1)) if (scheduledOn(habit, d)) comps.push(done('a', d));

    const { life } = computeProgress([habit], comps, today);
    const prevYear = hijriParts(prevStart)!.year;
    expect(life!.years.find((y) => y.year === prevYear)!.fraction).toBe(1);
  });

  // The same rule the month ring and the year strip follow: the period in progress is measured
  // against its WHOLE possible, so it fills gradually instead of snapping full on day one.
  it('measures the running year against the whole year, so a perfect start is not a full orbit', () => {
    // A "today" ~100 days into its Hijri year (a year runs ~354), so most of it is still ahead —
    // `today` above sits at the very end of 1447, where perfect-so-far correctly IS a full orbit.
    const yearStart = hijriYearStart(today)!.start;
    const midYear = addDaysISO(yearStart, 100);
    const habit = bornEarly2024('a');
    const comps: CompletionRow[] = [];
    for (let d = yearStart; d <= midYear; d = addDaysISO(d, 1)) if (scheduledOn(habit, d)) comps.push(done('a', d));

    const { life } = computeProgress([habit], comps, midYear);
    const current = life!.years.find((y) => y.state === 'current')!;
    expect(current.fraction).toBeGreaterThan(0);
    expect(current.fraction).toBeLessThan(1);
  });

  it('dates the record from the oldest habit', () => {
    const older = { ...dailyHabit('old'), created_at: '2024-01-05T09:00:00Z' };
    const newer = { ...dailyHabit('new'), created_at: '2026-01-05T09:00:00Z' };
    const { life } = computeProgress([newer, older], [], today);
    const opened = hijriMonthRange(createdDayISO('2024-01-05T09:00:00Z'))!;
    expect(life!.sinceMonthName).toBe(opened.monthName);
    expect(life!.sinceYear).toBe(opened.year);
  });

  it('has no life to show before there are any habits', () => {
    expect(computeProgress([], [], today).life).toBeNull();
  });

  it('every year is a valid fraction', () => {
    const { life } = computeProgress([bornEarly2024('a'), whiteDaysHabit('w')], [], today);
    for (const y of life!.years) {
      expect(y.fraction).toBeGreaterThanOrEqual(0);
      expect(y.fraction).toBeLessThanOrEqual(1);
    }
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

// ── Trend: the "Rising since …" statement reads only COMPLETE months ─────────────────────────
// These scenarios use the White-Days habit on purpose: it schedules exactly 3 acts per month
// regardless of a month's 29/30-day length, so each month's rate is an exact k/3 — the
// expectations are calendar-independent, where done-day counts on a daily habit would not be.

describe('computeProgress — trend (rising complete months)', () => {
  // Anchored mid-month so the current month is unambiguously incomplete.
  const currentStart = monthShape('2026-06-15').start;
  const today = addDaysISO(currentStart, 9); // day 10 of the current Hijri month

  /** The Hijri month starting `back` whole months before the month containing `anchorISO`. */
  function monthBack(anchorISO: string, back: number): { start: string; monthName: string } {
    let cursor = monthShape(anchorISO).start;
    for (let i = 0; i < back; i += 1) cursor = monthShape(addDaysISO(cursor, -1)).start;
    const range = hijriMonthRange(cursor);
    if (!range) throw new Error('Islamic calendar unavailable in this test environment');
    return { start: range.start, monthName: range.monthName };
  }

  /** A White-Days habit that began tracking on `createdISO` (local noon → unambiguous day). */
  const whiteDaysSince = (id: string, createdISO: string): ProgressHabit => ({
    ...whiteDaysHabit(id),
    created_at: `${createdISO}T12:00:00`,
  });

  /** `count` of the three White Days (13th–15th) done in the month starting at `monthStart`. */
  function whiteDone(id: string, monthStart: string, count: number): CompletionRow[] {
    return [13, 14, 15].slice(0, count).map((d) => done(id, addDaysISO(monthStart, d - 1)));
  }

  const noTrend: TrendSummary = { risingMonths: 0, sinceMonthName: null };

  it('empty inputs → no trend (and the shape is the no-trend value, not null)', () => {
    expect(computeProgress([], [], today).trend).toEqual(noTrend);
  });

  it('a habit with no completions at all → no trend (a flat zero line is not rising)', () => {
    expect(computeProgress([dailyHabit('a')], [], today).trend).toEqual(noTrend);
  });

  it('the first month of tracking → no trend (no complete months behind it)', () => {
    const h = whiteDaysSince('w', currentStart);
    expect(computeProgress([h], [], today).trend).toEqual(noTrend);
  });

  it('two rising complete months → still no trend (one increase is noise, not a direction)', () => {
    const h = whiteDaysSince('w', monthBack(today, 2).start);
    const comps = [...whiteDone('w', monthBack(today, 2).start, 1), ...whiteDone('w', monthBack(today, 1).start, 2)];
    expect(computeProgress([h], comps, today).trend).toEqual(noTrend);
  });

  it('three strictly rising complete months → risingMonths 3, since the run\'s first month', () => {
    const base = monthBack(today, 3);
    const h = whiteDaysSince('w', base.start);
    const comps = [
      ...whiteDone('w', base.start, 1), // 1/3
      ...whiteDone('w', monthBack(today, 2).start, 2), // 2/3
      ...whiteDone('w', monthBack(today, 1).start, 3), // 3/3
    ];
    expect(computeProgress([h], comps, today).trend).toEqual({ risingMonths: 3, sinceMonthName: base.monthName });
  });

  it('a plateau breaks the run (equal is not rising)', () => {
    const h = whiteDaysSince('w', monthBack(today, 3).start);
    const comps = [
      ...whiteDone('w', monthBack(today, 3).start, 2), // 2/3 ─┐ plateau
      ...whiteDone('w', monthBack(today, 2).start, 2), // 2/3 ─┘
      ...whiteDone('w', monthBack(today, 1).start, 3), // 3/3 — one rise, then the plateau stops it
    ];
    expect(computeProgress([h], comps, today).trend).toEqual(noTrend);
  });

  it('a dip then a rise → the run counts from the dip, older history ignored', () => {
    const h = whiteDaysSince('w', monthBack(today, 4).start);
    const dip = monthBack(today, 3);
    const comps = [
      ...whiteDone('w', monthBack(today, 4).start, 3), // 3/3 — a strong month BEFORE the dip
      ...whiteDone('w', dip.start, 1), // 1/3 — the dip: the run's base
      ...whiteDone('w', monthBack(today, 2).start, 2), // 2/3
      ...whiteDone('w', monthBack(today, 1).start, 3), // 3/3
    ];
    expect(computeProgress([h], comps, today).trend).toEqual({ risingMonths: 3, sinceMonthName: dip.monthName });
  });

  it('a perfect current month never fakes a rise (only complete months are read)', () => {
    // Anchor on the month's LAST day so all three of its White Days are in the past and done —
    // the strongest possible current month. If the walk wrongly included it (rate 3/3 = 1 above
    // a 2/3, 1/3 pair), it would claim a 3-month rise; excluding it correctly leaves 1 increase.
    const endToday = monthShape('2026-06-15').end;
    const h = whiteDaysSince('w', monthBack(endToday, 2).start);
    const comps = [
      ...whiteDone('w', monthBack(endToday, 2).start, 1),
      ...whiteDone('w', monthBack(endToday, 1).start, 2),
      ...whiteDone('w', monthShape(endToday).start, 3), // the current month, complete
    ];
    expect(computeProgress([h], comps, endToday).trend).toEqual(noTrend);
  });

  it('the walk stops where tracking began (possible = 0), not at a phantom zero month', () => {
    // Same rising 1/3 → 2/3 → 3/3 run, but with creation-unknown history the months BEFORE the
    // run exist with rate 0, and 1/3 over 0 is a genuine rise — the run legitimately reaches
    // back one more month. With `created_at` at the run's base (the test above), the walk breaks
    // there instead. The two cases differing is exactly the boundary this test pins.
    const base4 = monthBack(today, 4);
    const h = whiteDaysHabit('w'); // created_at: null → existed forever, idle before the run
    const comps = [
      ...whiteDone('w', monthBack(today, 3).start, 1),
      ...whiteDone('w', monthBack(today, 2).start, 2),
      ...whiteDone('w', monthBack(today, 1).start, 3),
    ];
    // Rates newest-first: 1, 2/3, 1/3, 0(idle), 0(idle)… — the run is 4 long (0 → 1/3 counts),
    // and the second idle-zero month is where the strictness stops it.
    expect(computeProgress([h], comps, today).trend).toEqual({ risingMonths: 4, sinceMonthName: base4.monthName });
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
