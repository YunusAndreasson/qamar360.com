import { describe, expect, it } from '@jest/globals';

import { addDaysISO, hijriMonthRange } from '@/lib/dates';
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

describe('the insight request the app sends', () => {
  const habits = [daily('a', 'Fajr in the mosque'), daily('b', 'Morning adhkār')];

  // The Worker re-derives the quarter totals from the per-habit metrics and rejects the request
  // if they disagree. They can only agree because `[id].tsx` passes the SAME `useProgress()`
  // habits that built the reading — send a narrower list and every insight is a silent 400.
  it('passes the Worker validator', () => {
    const today = '2026-09-05';
    const reading = latestClosedReading(today, habits);
    const body = personalizedInsightRequest(reading, habits as never, 0);
    expect(parseInsightRequest(body, reading.id, new Date(`${today}T12:00:00Z`))).not.toBeNull();
  });
});
