import { describe, expect, it } from '@jest/globals';

import { hijriMonthAfter, hijriMonthsBetween, hijriParts } from '@/lib/dates';
import { computeGoals, formatMeasure, goalMeta, horizonFromLunarMonths, type Goal, type GoalAct } from '@/lib/goals';
import type { CompletionRow, ProgressHabit } from '@/lib/progress';

/**
 * 19 Rabīʿ al-Awwal 1448 — a day chosen for what surrounds it rather than for itself: its Hijri
 * month runs 2026-08-14 … 2026-09-11 (29 days), so "today" sits with eleven scheduled days left
 * in the month and three whole closed months behind it. Every figure below is hand-checked
 * against that layout.
 */
const TODAY = '2026-09-01';
const MONTH_END = '2026-09-11';

/** A day inside each of the three closed months before this one. */
const LAST_MONTH = '2026-08-01'; // Ṣafar 1448
const TWO_BACK = '2026-07-01'; // Muḥarram 1448
const THREE_BACK = '2026-06-01'; // Dhū al-Ḥijjah 1447

type EngineHabit = ProgressHabit & { target_unit?: string | null };

function habit(overrides: Partial<EngineHabit> = {}): EngineHabit {
  return {
    id: 'h1',
    name: 'Memorised the new lines',
    // Long before every date in this file, so `scheduledOn` never excludes a day for not existing.
    created_at: '2025-01-01T00:00:00.000Z',
    schedule_days: [0, 1, 2, 3, 4, 5, 6],
    hijri_schedule: null,
    target_count: 4,
    target_unit: 'lines',
    ...overrides,
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    title: 'Ḥifẓ of the Qurʾān',
    unit: 'lines',
    target_value: 100,
    milestone_step: null,
    horizon_on: MONTH_END,
    obstacle: '',
    if_then: '',
    status: 'open',
    position: 0,
    // Well before the earliest month any test tallies, so the goal never gates its own pace
    // unless a test sets out to check that it does.
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: null,
    ...overrides,
  };
}

function act(habitId: string, contributes = true): GoalAct {
  return { goal_id: 'g1', habit_id: habitId, user_id: 'u1', contributes };
}

function row(habit_id: string, completed_at: string, status: string, count: number | null = null): CompletionRow {
  return { habit_id, completed_at, status, count };
}

/** The one reading, for the single-goal fixtures every test but one uses. */
function read(
  completions: CompletionRow[],
  overrides: Partial<Goal> = {},
  acts: GoalAct[] = [act('h1')],
  habits: EngineHabit[] = [habit()],
) {
  const [reading] = computeGoals([goal(overrides)], acts, habits, completions, TODAY);
  if (!reading) throw new Error('computeGoals returned nothing');
  return reading;
}

describe('the measure', () => {
  // The whole reason a goal does not reuse `creditFor`: that answers "how much of today's act was
  // done" and clamps at 1, this answers "how many lines were memorised" and eight is eight.
  it('counts a day that overshot its target in full', () => {
    expect(read([row('h1', TODAY, 'done', 8)]).earned).toBe(8);
  });

  // Everything written before this feature existed, plus the optimistic rows `withDoneToday`
  // injects, are a bare 'done' with no count.
  it('falls back to the act’s target for a done row with no count', () => {
    expect(read([row('h1', TODAY, 'done', null)]).earned).toBe(4);
  });

  it('counts a partial day at what was actually done', () => {
    expect(read([row('h1', TODAY, 'partial', 2)]).earned).toBe(2);
  });

  // An excused day is not a miss — but it is not a line memorised either.
  it('counts an excused day as nothing', () => {
    expect(read([row('h1', TODAY, 'skipped', null)]).earned).toBe(0);
  });

  it('sums the record', () => {
    const reading = read([
      row('h1', TODAY, 'done', 8),
      row('h1', '2026-08-31', 'done', null),
      row('h1', '2026-08-30', 'skipped', null),
      row('h1', '2026-08-29', 'partial', 2),
    ]);
    expect(reading.earned).toBe(14);
    expect(reading.remaining).toBe(86);
    expect(reading.met).toBe(false);
  });

  // Revision keeps a goal from draining; it does not add to what has been memorised. Getting this
  // wrong would report a ḥāfiẓ finishing years early.
  it('ignores a supporting act', () => {
    const acts = [act('h1'), act('h2', false)];
    const habits = [habit(), habit({ id: 'h2', name: 'Revised an older juzʾ', target_count: 20 })];
    const reading = read([row('h1', TODAY, 'done', 4), row('h2', TODAY, 'done', 20)], {}, acts, habits);
    expect(reading.earned).toBe(4);
    // It is still listed as part of the engine — it just moves no number.
    expect(reading.acts.map((a) => [a.name, a.contributes])).toEqual([
      ['Memorised the new lines', true],
      ['Revised an older juzʾ', false],
    ]);
  });

  it('reports a met target and stops asking for a quota', () => {
    const reading = read([row('h1', TODAY, 'done', 100)]);
    expect(reading.met).toBe(true);
    expect(reading.remaining).toBe(0);
    expect(reading.quota).toBeNull();
  });
});

describe('the quota', () => {
  // "By Ramaḍān" means you have Ramaḍān to do it in — the horizon's own month is included.
  it('asks for all that remains when the horizon is this month', () => {
    const reading = read([row('h1', TODAY, 'done', 10)]);
    expect(reading.monthsLeft).toBe(0);
    expect(reading.quota).toBe(100);
    expect(reading.quotaRemaining).toBe(90);
  });

  it('spreads the remainder over this month and every one up to the horizon', () => {
    const horizon = horizonFromLunarMonths(TODAY, 5);
    expect(horizon).not.toBeNull();
    const reading = read([], { horizon_on: horizon! });
    expect(reading.monthsLeft).toBe(5);
    // 100 over six months — this one and the five ahead.
    expect(reading.quota).toBe(17);
  });

  // The month's ask is settled when the month opens and does not retreat as you work at it —
  // what moves is how much of it is left.
  it('holds the month’s ask still and counts down what is left of it', () => {
    const reading = read([row('h1', TODAY, 'done', 30)]);
    expect(reading.quota).toBe(100);
    expect(reading.quotaRemaining).toBe(70);
  });

  it('eases the ask next month when this one ran ahead', () => {
    const horizon = horizonFromLunarMonths(TODAY, 5)!;
    // Nothing done: six months to spread 100 over.
    expect(read([], { horizon_on: horizon }).quota).toBe(17);
    // 40 done in a closed month leaves 60 over the same span — the quota falls with it.
    expect(read([row('h1', LAST_MONTH, 'done', 40)], { horizon_on: horizon }).quota).toBe(10);
  });

  // The by-when has gone. The goal is not closed and is not scolded; there is simply no longer a
  // span to spread over, so the whole remainder is what this month is holding.
  it('asks for the whole remainder once the horizon has passed', () => {
    const reading = read([], { horizon_on: '2026-06-01' });
    expect(reading.overdue).toBe(true);
    expect(reading.monthsLeft).toBe(0);
    expect(reading.quota).toBe(100);
  });
});

describe('the daily target', () => {
  // Eleven scheduled days left in this Hijri month (2026-09-01 … 2026-09-11).
  it('spreads what is left of the month over the act’s remaining scheduled days', () => {
    expect(read([]).dailyTarget).toBe(Math.ceil(100 / 11));
  });

  it('reads off the remainder, so it is true on the day it is read', () => {
    // 60 already done this month leaves 40 over the same eleven days.
    expect(read([row('h1', TODAY, 'done', 60)]).dailyTarget).toBe(Math.ceil(40 / 11));
  });

  it('counts only the days the act is actually scheduled', () => {
    // Fridays only: 2026-09-04 and 2026-09-11 fall inside the rest of the month.
    const friday = [habit({ schedule_days: [5] })];
    expect(read([], {}, [act('h1')], friday).dailyTarget).toBe(50);
  });

  // Splitting a quota between two acts would be a guess about which one you meant to do more of.
  it('offers nothing when more than one act contributes', () => {
    const acts = [act('h1'), act('h2')];
    const habits = [habit(), habit({ id: 'h2', name: 'Read a page' })];
    expect(read([], {}, acts, habits).dailyTarget).toBeNull();
  });

  it('offers nothing once this month’s quota is settled', () => {
    expect(read([row('h1', TODAY, 'done', 100)]).dailyTarget).toBeNull();
  });
});

describe('pace and arrival', () => {
  const history = [
    row('h1', LAST_MONTH, 'done', 10),
    row('h1', TWO_BACK, 'done', 20),
    row('h1', THREE_BACK, 'done', 30),
  ];

  it('averages the closed months and names the month it arrives in', () => {
    const reading = read(history, { horizon_on: horizonFromLunarMonths(TODAY, 5)! });
    expect(reading.pace).toBe(20); // (10 + 20 + 30) / 3
    // 40 left at 20 a month → two months from now.
    expect(reading.arrival).toEqual(hijriMonthAfter(TODAY, 2));
  });

  // Silence, not a guess: a goal that has not moved is not given an arrival date of never.
  it('names no arrival for a goal that is not moving', () => {
    const reading = read([]);
    expect(reading.pace).toBe(0);
    expect(reading.arrival).toBeNull();
  });

  // Months before the goal existed belong to a past it never asked for — and having none of them
  // is a different answer from having them and doing nothing, so it reads `null`, not zero.
  it('ignores months from before the goal was set', () => {
    const reading = read(history, { created_at: '2026-08-20T00:00:00.000Z' });
    expect(reading.pace).toBeNull();
    // The record still counts in full — only the pace window is gated.
    expect(reading.earned).toBe(60);
  });

  it('does not count the month being lived as a closed one', () => {
    const reading = read([row('h1', TODAY, 'done', 90), ...history]);
    expect(reading.pace).toBe(20);
  });
});

describe('reach', () => {
  const history = [
    row('h1', LAST_MONTH, 'done', 10),
    row('h1', TWO_BACK, 'done', 20),
    row('h1', THREE_BACK, 'done', 30),
  ];

  // 40 left, all of it asked for this month, against a best month of 30: 1.33× is past the line.
  it('calls a goal out of reach when the quota outruns your best month', () => {
    const reading = read(history);
    expect(reading.quota).toBe(40);
    expect(reading.reachable).toBe(false);
    // And it always has somewhere to send you: the horizon that would actually fit.
    expect(reading.arrival).not.toBeNull();
  });

  it('stays reachable while the quota is within a quarter of your best', () => {
    const reading = read(history, { target_value: 95 }); // 35 left → 35 / 30 = 1.17
    expect(reading.reachable).toBe(true);
  });

  // A goal one week old has not yet earned an opinion about itself.
  it('does not judge a goal with no closed month behind it', () => {
    const reading = read([], { target_value: 100000 });
    expect(reading.reachable).toBe(true);
  });
});

describe('milestones', () => {
  it('counts whole steps behind you and names the next', () => {
    const reading = read([row('h1', TODAY, 'done', 700)], { target_value: 9060, milestone_step: 302 });
    expect(reading.milestones).toEqual({ step: 302, reached: 2, next: 906 });
  });

  it('names no next step once the target itself is the next mark', () => {
    const reading = read([row('h1', TODAY, 'done', 95)], { target_value: 100, milestone_step: 50 });
    expect(reading.milestones).toEqual({ step: 50, reached: 1, next: 100 });
  });

  it('has none when the goal sets no step', () => {
    expect(read([]).milestones).toBeNull();
  });
});

describe('horizonFromLunarMonths', () => {
  it('lands on the last day of the month that many ahead', () => {
    // Zero months out is this month's own end — "by this Ramaḍān" includes Ramaḍān.
    expect(horizonFromLunarMonths(TODAY, 0)).toBe(MONTH_END);
    expect(hijriMonthsBetween(TODAY, horizonFromLunarMonths(TODAY, 5)!)).toBe(5);
  });

  it('carries a twenty-year span across the year boundaries', () => {
    const horizon = horizonFromLunarMonths(TODAY, 240);
    expect(hijriMonthsBetween(TODAY, horizon!)).toBe(240);
    const parts = hijriParts(horizon!);
    // Twenty lunar years on from Rabīʿ al-Awwal 1448 is the same month of 1468.
    expect(parts).toMatchObject({ month: 3, year: 1468 });
  });
});

describe('the engine', () => {
  it('lists nothing when every act behind a goal has been deleted', () => {
    const reading = read([row('h1', TODAY, 'done', 4)], {}, [act('h1')], []);
    expect(reading.acts).toEqual([]);
    // And it reports no progress rather than inventing some from rows it cannot price.
    expect(reading.earned).toBe(0);
  });
});

describe('goalMeta', () => {
  // The month's ask leads, because it is the only line here that is about today. The arrival
  // month and the pace live on the goal's own screen.
  it('names what this month is still asking for', () => {
    expect(goalMeta(read([row('h1', TODAY, 'done', 30)]), TODAY)).toBe('Rabīʿ al-Awwal asks 70 lines');
  });

  it('says the month is settled rather than asking for nothing', () => {
    const horizon = horizonFromLunarMonths(TODAY, 5)!;
    // 17 is the month's ask over six months; 20 done settles it.
    expect(goalMeta(read([row('h1', TODAY, 'done', 20)], { horizon_on: horizon }), TODAY)).toBe('Rabīʿ al-Awwal settled');
  });

  it('states a passed horizon as a fact, with what is left', () => {
    expect(goalMeta(read([], { horizon_on: '2026-06-01' }), TODAY)).toBe('The horizon has passed · 100 lines to go');
  });

  it('reads a met goal as reached', () => {
    expect(goalMeta(read([row('h1', TODAY, 'done', 100)]), TODAY)).toBe('Reached');
  });

  it('reads a goal put down as set aside', () => {
    expect(goalMeta(read([], { status: 'released' }), TODAY)).toBe('Set aside');
  });
});

describe('formatMeasure', () => {
  it('separates thousands and keeps at most one decimal', () => {
    expect(formatMeasure(9060)).toBe('9,060');
    expect(formatMeasure(0.5)).toBe('0.5');
    expect(formatMeasure(17.04)).toBe('17');
  });
});
