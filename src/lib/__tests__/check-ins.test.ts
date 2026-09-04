import { describe, expect, it } from '@jest/globals';

import {
  CADENCES,
  cadenceFields,
  cadenceOf,
  checkInRowContract,
  describeCadence,
  dueOnDay,
  hasCadence,
  latestBefore,
  LOOKBACK_DAYS,
  openCountOn,
  openSince,
  readingLine,
  showsOn,
  visibleCheckIns,
  type Cadenced,
  type GoalCheckIn,
} from '@/lib/check-ins';

/**
 * The same Hijri layout `goals.test.ts` is hand-checked against: Rabīʿ al-Awwal 1448 runs
 * 2026-08-14 … 2026-09-11, twenty-nine days. So within this file
 *
 *   1 Rabīʿ al-Awwal = 2026-08-14 (Friday)     15 = 2026-08-28 (Friday)
 *   8 Rabīʿ al-Awwal = 2026-08-21 (Friday)     22 = 2026-09-04 (Friday)
 *
 * and "today" is 2026-09-01, a **Tuesday**, 19 Rabīʿ al-Awwal. Every date below is checked
 * against that grid rather than computed, so a wrong one fails loudly instead of quietly
 * agreeing with whatever the code does.
 */
const TODAY = '2026-09-01';
const MONTH_FIRST = '2026-08-14';
const QUARTER_15 = '2026-08-28';
const QUARTER_22 = '2026-09-04';
const LAST_MONTH_FIRST = '2026-07-16'; // 2 Ṣafar — deliberately NOT the 1st, see the month test
const TUESDAY = TODAY;
const MONDAY = '2026-08-31';

const FROM = '2026-01-01'; // long before anything here

type TestGoal = Cadenced & { id: string; position: number };

function goal(cadence: Partial<Cadenced> = {}, id = 'g1', position = 0): TestGoal {
  return { id, position, check_in_days: [], check_in_hijri: null, check_in_from: null, ...cadence };
}

const daily = (id = 'g1', position = 0) => goal({ ...cadenceFields('daily', 1, FROM) }, id, position);
const weeklyTue = (id = 'g1') => goal({ ...cadenceFields('weekly', 2, FROM) }, id);
const quarterly = (id = 'g1') => goal({ ...cadenceFields('quarter', 1, FROM) }, id);
const monthly = (id = 'g1') => goal({ ...cadenceFields('month', 1, FROM) }, id);

let seq = 0;
function reading(taken_on: string, value = 1, goal_id = 'g1'): GoalCheckIn {
  seq += 1;
  return {
    id: `c${seq}`,
    goal_id,
    user_id: 'u1',
    taken_on,
    value,
    note: '',
    created_at: null,
    updated_at: null,
  };
}

describe('the cadence', () => {
  it('stores every offered cadence in a shape `scheduledOn` can read', () => {
    for (const cadence of CADENCES) {
      const fields = cadenceFields(cadence.key, 2, FROM);
      expect(fields.check_in_days.length > 0 || fields.check_in_hijri !== null).toBe(true);
      expect(hasCadence({ ...fields })).toBe(true);
    }
  });

  // The round trip is the invariant that matters: a cadence stored by the picker has to be the
  // one the goal screen reads back, or the two drift and nobody notices until a check-in fires
  // on the wrong day.
  it('reads every cadence back as the one that was stored', () => {
    for (const cadence of CADENCES) {
      expect(cadenceOf({ ...cadenceFields(cadence.key, 2, FROM) })).toBe(cadence.key);
    }
  });

  it('names the weekday a weekly cadence is on', () => {
    expect(describeCadence(weeklyTue())).toBe('Every Tuesday');
    expect(describeCadence(daily())).toBe('Every day');
    expect(describeCadence(quarterly())).toBe('Each moon quarter');
    expect(describeCadence(monthly())).toBe('Each Hijri month');
  });

  it('says nothing is being asked when there is no cadence', () => {
    expect(hasCadence(goal())).toBe(false);
    expect(describeCadence(goal())).toBe('Not asking');
    expect(cadenceOf(goal())).toBeNull();
  });

  // A schedule with no start day would fire into the past; the DB rejects it, and so does this.
  it('is not a cadence without a start day', () => {
    expect(hasCadence(goal({ check_in_days: [1], check_in_hijri: null, check_in_from: null }))).toBe(false);
  });
});

describe('which days it asks on', () => {
  it('asks every day on the daily cadence', () => {
    expect(dueOnDay(daily(), TODAY)).toBe(true);
    expect(dueOnDay(daily(), '2026-08-30')).toBe(true);
  });

  it('asks on one weekday only, on the weekly cadence', () => {
    expect(dueOnDay(weeklyTue(), TUESDAY)).toBe(true);
    expect(dueOnDay(weeklyTue(), MONDAY)).toBe(false);
  });

  // The whole reason the moon quarter reuses MILESTONE_DAYS rather than restating it.
  it('asks on the four moon quarters, and on no day between them', () => {
    expect(dueOnDay(quarterly(), MONTH_FIRST)).toBe(true);
    expect(dueOnDay(quarterly(), '2026-08-21')).toBe(true);
    expect(dueOnDay(quarterly(), QUARTER_15)).toBe(true);
    expect(dueOnDay(quarterly(), QUARTER_22)).toBe(true);
    expect(dueOnDay(quarterly(), TODAY)).toBe(false); // 19 Rabīʿ al-Awwal
  });

  it('asks on the first of each Hijri month, whatever its length', () => {
    expect(dueOnDay(monthly(), MONTH_FIRST)).toBe(true); // 1 Rabīʿ al-Awwal, a 29-day month
    expect(dueOnDay(monthly(), '2026-09-12')).toBe(true); // 1 Rabīʿ al-Thānī, the day after it ends
    expect(dueOnDay(monthly(), LAST_MONTH_FIRST)).toBe(false); // 2 Ṣafar, one day late
    expect(dueOnDay(monthly(), '2026-09-11')).toBe(false); // 29 Rabīʿ al-Awwal, the last day
  });

  // Without this, a cadence added today looks overdue back to the goal's creation — and the day
  // view reaches thirty days into the past, so it would look overdue on every one of them.
  it('never asks on a day before the cadence was set', () => {
    const late = goal({ ...cadenceFields('daily', 1, TODAY) });
    expect(dueOnDay(late, TODAY)).toBe(true);
    expect(dueOnDay(late, '2026-08-31')).toBe(false);
  });
});

describe('what is still waiting', () => {
  it('waits from the day it asked until something answers it', () => {
    expect(openSince(weeklyTue(), [], TUESDAY)).toBe(TUESDAY);
    expect(openSince(weeklyTue(), [reading(TUESDAY)], TUESDAY)).toBeNull();
  });

  // "It should become visible on the set day and not disappear until I check in."
  it('goes on waiting for days after the day it asked', () => {
    const asked = '2026-08-25'; // the Tuesday before
    for (const day of ['2026-08-26', '2026-08-28', '2026-08-31']) {
      expect(openSince(weeklyTue(), [], day)).toBe(asked);
    }
  });

  // The load-bearing property. A to-do carries forward one at a time because it happens once; a
  // cadence that carried every missed occurrence would put seven rows on Today after a quiet week.
  it('waits for exactly one day at a time, however long it is ignored', () => {
    const answered: GoalCheckIn[] = [];
    // Six days of a daily cadence, untouched.
    expect(openSince(daily(), answered, '2026-08-26')).toBe('2026-08-26');
    expect(openSince(daily(), answered, TODAY)).toBe(TODAY);
    // And the row it produces is one row, not six.
    expect(visibleCheckIns([daily()], answered, TODAY, TODAY)).toHaveLength(1);
  });

  it('is answered by a reading given on any day since the ask', () => {
    const asked = '2026-08-25';
    expect(openSince(weeklyTue(), [reading('2026-08-27')], '2026-08-31')).toBeNull();
    // …but not by one given before it.
    expect(openSince(weeklyTue(), [reading('2026-08-24')], '2026-08-31')).toBe(asked);
  });

  it('lets an ask go once it is further back than the lookback', () => {
    const long = goal({ ...cadenceFields('weekly', 2, FROM) });
    // A cadence whose only occurrence in range is inside LOOKBACK_DAYS still waits…
    expect(openSince(long, [], TODAY)).not.toBeNull();
    // …and a monthly one asked more than LOOKBACK_DAYS ago has been let go, not stacked up.
    const stale = goal({ check_in_days: [], check_in_hijri: { dates: [{ month: 1, day: 1 }] }, check_in_from: FROM });
    expect(openSince(stale, [], TODAY)).toBeNull();
    expect(LOOKBACK_DAYS).toBeGreaterThanOrEqual(30); // a 30-day Hijri month must always fit
  });

  it('waits for nothing when the goal asks for nothing', () => {
    expect(openSince(goal(), [], TODAY)).toBeNull();
  });
});

describe('which day it shows on', () => {
  it('shows on the day it was answered, when that day is stepped back to', () => {
    const answered = [reading('2026-08-25', 82)];
    expect(showsOn(weeklyTue(), answered, '2026-08-25', TODAY)).toBe(true);
  });

  it('shows on its own day while unanswered', () => {
    expect(showsOn(weeklyTue(), [], '2026-08-25', TODAY)).toBe(true);
  });

  it('shows on today while it is still waiting', () => {
    expect(showsOn(weeklyTue(), [], TODAY, TODAY)).toBe(true);
  });

  // The same hole `tasks.showsOn` leaves, and for the same reason: it belongs to its own day.
  it('does not fill the days between an ask and today', () => {
    expect(showsOn(weeklyTue(), [], '2026-08-26', TODAY)).toBe(false);
  });

  it('leaves a past day alone once that day was answered on a later one', () => {
    const answered = [reading('2026-08-27', 82)];
    expect(showsOn(weeklyTue(), answered, '2026-08-25', TODAY)).toBe(false);
  });

  it('shows nothing at all for a goal with no cadence', () => {
    expect(showsOn(goal(), [reading(TODAY)], TODAY, TODAY)).toBe(false);
  });
});

describe('the day’s list', () => {
  it('is ordered by the goals’ own order, not by what was answered', () => {
    const goals = [daily('g2', 1), daily('g1', 0)];
    const rows = visibleCheckIns(goals, [reading(TODAY, 5, 'g2')], TODAY, TODAY);
    expect(rows.map((r) => r.goal.id)).toEqual(['g1', 'g2']);
  });

  // An answered row greys where it stands. It must not sink and must not vanish: either takes the
  // correction you might want a second later out from under the finger that just typed one.
  it('keeps an answered check-in on the day it was answered', () => {
    const rows = visibleCheckIns([daily()], [reading(TODAY, 82)], TODAY, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.answer?.value).toBe(82);
    expect(rows[0]?.since).toBeNull();
  });

  it('carries the previous reading, which is what the field opens on', () => {
    const rows = visibleCheckIns([daily()], [reading('2026-08-31', 83)], TODAY, TODAY);
    expect(rows[0]?.previous?.value).toBe(83);
  });

  it('counts only the unanswered ones against the day’s close', () => {
    expect(openCountOn([daily()], [], TODAY, TODAY)).toBe(1);
    expect(openCountOn([daily()], [reading(TODAY, 82)], TODAY, TODAY)).toBe(0);
    expect(openCountOn([goal()], [], TODAY, TODAY)).toBe(0);
  });
});

describe('latestBefore', () => {
  it('takes the most recent reading strictly before the day', () => {
    const rows = [reading('2026-08-20', 85), reading('2026-08-30', 83), reading(TODAY, 82)];
    expect(latestBefore(rows, 'g1', TODAY)?.value).toBe(83);
    expect(latestBefore(rows, 'g1', '2026-08-21')?.value).toBe(85);
    expect(latestBefore(rows, 'g1', '2026-08-01')).toBeNull();
  });

  it('never reaches into another goal’s readings', () => {
    expect(latestBefore([reading('2026-08-30', 83, 'g2')], 'g1', TODAY)).toBeNull();
  });
});

describe('the row', () => {
  const base = { title: 'Weight', unit: 'kg', today: TODAY };

  it('asks, and offers the last reading to start from', () => {
    const row = checkInRowContract({
      ...base,
      since: TODAY,
      answer: null,
      previous: { value: 83.1, taken_on: '2026-08-31' },
    });
    expect(row.mode).toBe('open');
    expect(row.role).toBe('button');
    expect(row.meta).toBe('83.1 kg yesterday');
  });

  // The same absence of "overdue", of red and of a count of days missed that a carried-forward
  // to-do keeps. It is a note of where the ask came from, not a reproach.
  it('names the day it has been waiting since, and never calls it overdue', () => {
    const row = checkInRowContract({ ...base, since: '2026-08-27', answer: null, previous: null });
    expect(row.meta).toBe('Thursday');
    expect(row.label).toBe('Weight, asked since thursday');
    expect(`${row.meta} ${row.label} ${row.hint}`).not.toMatch(/overdue|late|missed|behind/i);
  });

  // `dayTitle`'s ladder, inherited whole: a bare weekday only while it still picks one day out.
  // Seven days back the weekdays repeat, and "Tuesday" would name two of them.
  it('dates the day once a bare weekday would be ambiguous', () => {
    const row = checkInRowContract({ ...base, since: '2026-08-25', answer: null, previous: null });
    expect(row.meta).toBe('Tue, Aug 25');
  });

  it('shows the reading once it has one, and offers to correct it', () => {
    const row = checkInRowContract({ ...base, since: null, answer: { value: 82.4 }, previous: null });
    expect(row.mode).toBe('answered');
    expect(row.meta).toBe('82.4 kg');
    expect(row.hint).toBe('Corrects the reading.');
  });

  it('says nothing on the second line when there is nothing to say', () => {
    expect(checkInRowContract({ ...base, since: TODAY, answer: null, previous: null }).meta).toBeNull();
  });
});

describe('readingLine', () => {
  // "on Yesterday" is not a sentence, and lowercasing a date to fix it gives "on thu, aug 20".
  it('drops the preposition for a day that has a name', () => {
    expect(readingLine(82.4, 'kg', TODAY, TODAY)).toBe('82.4 kg today');
    expect(readingLine(82.4, 'kg', '2026-08-31', TODAY)).toBe('82.4 kg yesterday');
  });

  it('keeps it, and the capitals, for a date', () => {
    expect(readingLine(3260, 'lines', '2026-08-20', TODAY)).toBe('3,260 lines on Thu, Aug 20');
  });
});
