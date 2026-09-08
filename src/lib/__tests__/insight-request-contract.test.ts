import { describe, expect, it } from '@jest/globals';

import { addDaysISO, hijriMonthRange } from '@/lib/dates';
import { computeGoals, type Goal, type GoalAct, type GoalReading } from '@/lib/goals';
import { computeReadings, type Reading } from '@/lib/insights';
import { personalizedInsightRequest } from '@/lib/personalized-insights';
import { creditOnDay, type CompletionRow, type ProgressHabit } from '@/lib/progress';

// The Worker's validator, imported straight from the web app — the contract is only real if both
// halves are the shipped code. `web/src/lib/personalized-insights.ts` has no imports of its own,
// so it loads here as plain TypeScript.
import { parseInsightRequest } from '../../../web/src/lib/personalized-insights';

/**
 * The mobile envelope must survive the Worker's validator.
 *
 * The two halves live in different packages with different test runners, and each was only ever
 * tested against its own fixtures — so nothing checked that what the app actually sends is what
 * the Worker actually accepts. A rejection here is a silent 400 on device, surfacing as "The
 * deeper reflection is unavailable right now."
 */

type NamedHabit = ProgressHabit & { name?: string | null };

const daily = (id: string, name = id): NamedHabit => ({
  id,
  name,
  created_at: null,
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  hijri_schedule: null,
});

const done = (habit_id: string, completed_at: string): CompletionRow => ({
  habit_id,
  completed_at,
  status: 'done',
  count: null,
});

function doneAcross(ids: string[], startISO: string, endISO: string): CompletionRow[] {
  const rows: CompletionRow[] = [];
  for (let day = startISO; day <= endISO; day = addDaysISO(day, 1)) {
    for (const id of ids) rows.push(done(id, day));
  }
  return rows;
}

/** The latest CLOSED reading for a record kept across the last two Hijri months. */
function latestClosedReading(today: string, habits: NamedHabit[]): Reading {
  const monthStart = hijriMonthRange(today)?.start ?? today;
  const from = addDaysISO(monthStart, -60);
  const rows = doneAcross(habits.map((h) => h.id), from, addDaysISO(today, -1));
  const readings = computeReadings(habits, creditOnDay(rows), today);
  const closed = readings.find((reading) => reading.closed);
  if (!closed) throw new Error('fixture produced no closed reading');
  return closed;
}

function goalRow(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    title: 'Ḥifẓ of the Qurʾān',
    unit: 'lines',
    target_value: 9060,
    milestone_step: 302,
    horizon_on: '2031-01-01',
    obstacle: '',
    if_then: '',
    status: 'open',
    position: 0,
    check_in_days: [],
    check_in_hijri: null,
    check_in_from: null,
    direction: 'up',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

/** The goal readings the reading screen would hand the envelope, derived the way it derives them. */
function goalReadings(today: string, habits: NamedHabit[], goals: Goal[]): GoalReading[] {
  const acts: GoalAct[] = goals.map((goal) => ({
    goal_id: goal.id,
    habit_id: habits[0]!.id,
    user_id: 'u1',
    contributes: true,
  }));
  const rows = doneAcross([habits[0]!.id], addDaysISO(today, -90), addDaysISO(today, -1));
  return computeGoals(goals, acts, habits, rows, [], today);
}

describe('the insight request the app sends', () => {
  const habits = [daily('a', 'Fajr in the mosque'), daily('b', 'Morning adhkār')];
  const today = '2026-09-05';

  // The Worker re-derives the quarter totals from the per-habit metrics and rejects the request
  // if they disagree. They can only agree because `[id].tsx` passes the SAME `useProgress()`
  // habits that built the reading — send a narrower list and every insight is a silent 400.
  it('passes the Worker validator', () => {
    const reading = latestClosedReading(today, habits);
    const body = personalizedInsightRequest(reading, habits as never, [], 0);
    expect(parseInsightRequest(body, reading.id, new Date(`${today}T12:00:00Z`))).not.toBeNull();
  });

  // The goals block is bounded on both sides — `computeGoals` produces a `null` pace and a `null`
  // quota in ordinary states, and a validator that only accepted numbers would reject a real
  // request from a real account without either half's own tests noticing.
  it('passes the validator with goals attached', () => {
    const reading = latestClosedReading(today, habits);
    const goals = goalReadings(today, habits, [goalRow(), goalRow({ id: 'g2', direction: 'down', title: '75 kg', unit: 'kg', target_value: 75 })]);
    const body = personalizedInsightRequest(reading, habits as never, goals, 0);
    const parsed = parseInsightRequest(body, reading.id, new Date(`${today}T12:00:00Z`));
    expect(parsed?.goals).toHaveLength(2);
  });

  // A goal put down asks nothing of the month and has no business in a paragraph about it.
  it('leaves out the goals that are no longer live', () => {
    const reading = latestClosedReading(today, habits);
    const goals = goalReadings(today, habits, [goalRow({ status: 'released' }), goalRow({ id: 'g2', status: 'reached' })]);
    const body = personalizedInsightRequest(reading, habits as never, goals, 0);
    expect(parseInsightRequest(body, reading.id, new Date(`${today}T12:00:00Z`))?.goals).toEqual([]);
  });

  // An app built before the Worker learned about goals sends no `goals` key at all. It must still
  // get an insight — the field is normalised to empty rather than rejected.
  it('accepts an envelope with no goals key at all', () => {
    const reading = latestClosedReading(today, habits);
    const { goals: _dropped, ...older } = personalizedInsightRequest(reading, habits as never, [], 0);
    expect(parseInsightRequest(older, reading.id, new Date(`${today}T12:00:00Z`))?.goals).toEqual([]);
  });

  // And a goals key that is present but malformed is a rejection, not a silent drop: a half-read
  // goal in the prompt is worse than no goal in it.
  it('rejects a malformed goals block', () => {
    const reading = latestClosedReading(today, habits);
    const body = personalizedInsightRequest(reading, habits as never, [], 0);
    const broken = { ...body, goals: [{ id: 'g1', target: 'lots' }] };
    expect(parseInsightRequest(broken, reading.id, new Date(`${today}T12:00:00Z`))).toBeNull();
  });
});
