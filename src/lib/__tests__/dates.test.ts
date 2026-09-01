import { afterEach, describe, expect, it } from '@jest/globals';

import {
  addDaysISO,
  dayTitle,
  describeHijriOffset,
  describeHijriSchedule,
  describeWeekdays,
  hijriMonthAfter,
  hijriMonthRange,
  hijriMonthsBetween,
  hijriParts,
  hijriYearRange,
  scheduledOn,
  setHijriOffset,
  todayLocalISO,
  weekdayIndex,
  weekOrder,
} from '@/lib/dates';

// The Hijri offset is module state shared by every test in this file — always put it back.
afterEach(() => setHijriOffset(0));

describe('todayLocalISO', () => {
  it('formats local date parts as YYYY-MM-DD (not UTC)', () => {
    // Local-time construction: June (month index 5), day 27.
    expect(todayLocalISO(new Date(2026, 5, 27))).toBe('2026-06-27');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayLocalISO(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('addDaysISO', () => {
  it('adds and subtracts days', () => {
    expect(addDaysISO('2026-06-27', 1)).toBe('2026-06-28');
    expect(addDaysISO('2026-06-27', -1)).toBe('2026-06-26');
  });

  it('rolls over month and year boundaries', () => {
    expect(addDaysISO('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('dayTitle', () => {
  // A Saturday, so a week back lands on the preceding Sunday and the boundary is easy to read.
  const TODAY = '2026-08-15';

  it('names the two near days rather than dating them', () => {
    expect(dayTitle(TODAY, TODAY)).toBe('Today');
    expect(dayTitle('2026-08-14', TODAY)).toBe('Yesterday');
  });

  it('defaults to the list form — a short weekday and a date, never a bare weekday', () => {
    // Two days back: near enough that a header would say "Thursday", and a list still may not.
    expect(dayTitle('2026-08-13', TODAY)).toBe('Thu, Aug 13');
  });

  it('takes a bare weekday for the last week only when asked', () => {
    expect(dayTitle('2026-08-13', TODAY, { weekday: 'long' })).toBe('Thursday');
    expect(dayTitle('2026-08-09', TODAY, { weekday: 'long' })).toBe('Sunday');
  });

  it('drops the bare weekday once the weekdays repeat', () => {
    // Exactly seven days back is the first day a bare "Saturday" could mean either one.
    expect(dayTitle('2026-08-08', TODAY, { weekday: 'long' })).toBe('Sat, Aug 8');
  });

  it('prefers the near-day names over the option', () => {
    expect(dayTitle('2026-08-14', TODAY, { weekday: 'long' })).toBe('Yesterday');
  });

  it('names a day the same way whichever surface asks — the whole point of one ladder', () => {
    // Today's header and a to-do carried forward from that same day: one call, so they cannot
    // disagree about what to call it.
    expect(dayTitle('2026-08-08', TODAY, { weekday: 'long' })).toBe(dayTitle('2026-08-08', TODAY));
  });
});

describe('weekdayIndex', () => {
  it('returns 0=Sunday … 6=Saturday', () => {
    // 2026-01-01 is a Thursday.
    expect(weekdayIndex('2026-01-01')).toBe(4);
    expect(weekdayIndex('2026-01-04')).toBe(0); // the following Sunday
  });
});

describe('scheduledOn', () => {
  it('matches a weekday schedule', () => {
    const habit = { created_at: null, schedule_days: [4] }; // Thursdays
    expect(scheduledOn(habit, '2026-01-01')).toBe(true); // Thursday
    expect(scheduledOn(habit, '2026-01-02')).toBe(false); // Friday
  });

  it('is false before the habit was created', () => {
    const habit = { created_at: '2026-06-01T00:00:00', schedule_days: [0, 1, 2, 3, 4, 5, 6] };
    expect(scheduledOn(habit, '2026-01-01')).toBe(false);
    expect(scheduledOn(habit, '2026-06-02')).toBe(true);
  });

  it('matches a Hijri month-day schedule when the Islamic calendar is available', () => {
    const iso = '2026-06-27';
    const parts = hijriParts(iso);
    if (!parts) return; // runtime without islamic-umalqura — feature is hidden, nothing to assert
    const otherDay = (parts.day % 30) + 1; // any day that isn't today's Hijri day
    expect(scheduledOn({ created_at: null, schedule_days: [], hijri_schedule: { monthDays: [parts.day] } }, iso)).toBe(true);
    expect(scheduledOn({ created_at: null, schedule_days: [], hijri_schedule: { monthDays: [otherDay] } }, iso)).toBe(false);
  });
});
describe('describeHijriSchedule', () => {
  it('names the White Days', () => {
    expect(describeHijriSchedule({ monthDays: [13, 14, 15] })).toBe('White Days (13–15)');
  });

  it('describes months and annual dates', () => {
    expect(describeHijriSchedule({ months: [9] })).toBe('Ramaḍān');
    expect(describeHijriSchedule({ dates: [{ month: 1, day: 10 }] })).toBe('10 Muḥarram');
  });

  it('falls back when nothing is set', () => {
    expect(describeHijriSchedule({})).toBe('No Hijri days');
  });
});

describe('weekOrder', () => {
  it('rotates the week to start on the chosen day', () => {
    expect(weekOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]); // Sunday
    expect(weekOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]); // Monday
    expect(weekOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]); // Saturday
  });

  it('always yields each weekday exactly once', () => {
    for (const start of [0, 1, 6]) {
      expect([...weekOrder(start)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });
});

describe('setHijriOffset', () => {
  const ISO = '2026-07-19';

  it('shifts the Hijri date by whole days', () => {
    // Both references are read while the offset is still 0 — asking for them afterwards would
    // shift them too, and the comparison would say nothing.
    const base = hijriParts(ISO);
    const nextDay = hijriParts(addDaysISO(ISO, 1));
    if (!base) return; // runtime without islamic-umalqura — nothing to assert
    setHijriOffset(1);
    // +1 lands on the Hijri date of the NEXT Gregorian day: today is one day further along.
    expect(hijriParts(ISO)).toEqual(nextDay);
    expect(hijriParts(ISO)).not.toEqual(base);
  });

  it('clears the cached parts, so a day read before the change is re-read after it', () => {
    const base = hijriParts(ISO); // warms the cache for this day
    const twoBack = hijriParts(addDaysISO(ISO, -2));
    if (!base) return;
    setHijriOffset(-2);
    expect(hijriParts(ISO)).toEqual(twoBack); // the warm entry did not survive the change
    setHijriOffset(0);
    expect(hijriParts(ISO)).toEqual(base); // and back again
  });

  it('moves the days a Hijri-scheduled habit falls on', () => {
    const base = hijriParts(ISO);
    if (!base) return;
    const habit = { created_at: null, schedule_days: [], hijri_schedule: { monthDays: [base.day] } };
    expect(scheduledOn(habit, ISO)).toBe(true);
    setHijriOffset(1);
    // The same Gregorian day now carries a different Hijri day, so the habit isn't due on it —
    // it has moved to the day before, which now carries `base.day`.
    expect(scheduledOn(habit, ISO)).toBe(false);
    expect(scheduledOn(habit, addDaysISO(ISO, -1))).toBe(true);
  });

  it('carries into the month range built on top of it', () => {
    const base = hijriMonthRange(ISO);
    if (!base) return;
    setHijriOffset(1);
    const shifted = hijriMonthRange(ISO);
    expect(shifted?.start).toBe(addDaysISO(base.start, -1));
  });
});

describe('hijriYearRange', () => {
  const ISO = '2026-07-19';

  it('opens on 1 Muḥarram of the year that contains the day', () => {
    const parts = hijriParts(ISO);
    const range = hijriYearRange(ISO);
    if (!parts || !range) return; // runtime without islamic-umalqura
    const start = hijriParts(range.start);
    expect(start).toMatchObject({ day: 1, month: 1, year: parts.year });
    expect(range.year).toBe(parts.year);
  });

  it('runs 354 or 355 days and ends the day before the next year opens', () => {
    const range = hijriYearRange(ISO);
    if (!range) return;
    expect([354, 355]).toContain(range.length);
    expect(hijriParts(range.end)?.month).toBe(12);
    expect(hijriParts(addDaysISO(range.end, 1))?.year).toBe(range.year + 1);
  });

  it('is tiled exactly by its twelve months', () => {
    const range = hijriYearRange(ISO);
    if (!range) return;
    // Walking month by month from the year's start must consume every day and land on its end —
    // the structural check that catches an off-by-one in the walk back to Muḥarram.
    let cursor = range.start;
    let days = 0;
    for (let m = 1; m <= 12; m++) {
      const month = hijriMonthRange(cursor);
      if (!month) return;
      expect(month.start).toBe(cursor);
      expect(hijriParts(cursor)?.month).toBe(m);
      days += month.length;
      cursor = addDaysISO(month.end, 1);
    }
    expect(days).toBe(range.length);
    expect(addDaysISO(cursor, -1)).toBe(range.end);
  });

  it('is the same year whichever of its days you ask from', () => {
    const range = hijriYearRange(ISO);
    if (!range) return;
    for (const day of [range.start, addDaysISO(range.start, 200), range.end]) {
      expect(hijriYearRange(day)).toEqual(range);
    }
  });

  it('honours the Hijri adjustment, like the month range built beside it', () => {
    const base = hijriYearRange(ISO);
    if (!base) return;
    setHijriOffset(1);
    expect(hijriYearRange(ISO)?.start).toBe(addDaysISO(base.start, -1));
  });
});

describe('describeHijriOffset', () => {
  it('names the untouched calendar rather than showing a zero', () => {
    expect(describeHijriOffset(0)).toBe('Umm al-Qura');
  });

  it('signs the shift and pluralises', () => {
    expect(describeHijriOffset(1)).toBe('+1 day');
    expect(describeHijriOffset(2)).toBe('+2 days');
    expect(describeHijriOffset(-1)).toBe('−1 day');
  });
});

describe('describeWeekdays', () => {
  it('says "Every day" rather than listing all seven', () => {
    expect(describeWeekdays([0, 1, 2, 3, 4, 5, 6], 1)).toBe('Every day');
    // Order of the stored array is irrelevant — it's a set of days, not a sequence.
    expect(describeWeekdays([3, 0, 6, 1, 5, 2, 4], 0)).toBe('Every day');
  });

  it('lists a subset in the user’s own week order', () => {
    // Mon/Wed/Fri, read from a Monday-start week…
    expect(describeWeekdays([1, 3, 5], 1)).toBe('Mon · Wed · Fri');
    // …and the same days from a Saturday-start week put nothing in front of them (none is Sat/Sun).
    expect(describeWeekdays([1, 3, 5], 6)).toBe('Mon · Wed · Fri');
  });

  it('reorders around the week start rather than always leading with Sunday', () => {
    expect(describeWeekdays([0, 1], 0)).toBe('Sun · Mon'); // Sunday first
    expect(describeWeekdays([0, 1], 1)).toBe('Mon · Sun'); // Monday first, Sunday last
  });

  it('names a single day', () => {
    expect(describeWeekdays([5], 1)).toBe('Fri');
  });

  it('never renders a blank, even for a schedule the editor can’t produce', () => {
    expect(describeWeekdays([], 1)).toBe('No days');
  });
});

describe('hijriMonthsBetween', () => {
  const ISO = '2026-09-01'; // 19 Rabīʿ al-Awwal 1448

  it('is zero inside one Hijri month and counts whole months across', () => {
    if (!hijriParts(ISO)) return; // runtime without islamic-umalqura
    expect(hijriMonthsBetween(ISO, '2026-09-11')).toBe(0); // same month, its last day
    expect(hijriMonthsBetween(ISO, '2026-09-12')).toBe(1); // the next month opens
    expect(hijriMonthsBetween(ISO, '2026-08-01')).toBe(-1); // the month before
  });

  // Twelve months to an Umm al-Qura year, always — which is why this subtracts month numbers
  // instead of dividing a day count by 29.53 and accumulating drift over a long horizon.
  it('crosses year boundaries exactly', () => {
    if (!hijriParts(ISO)) return;
    expect(hijriMonthsBetween(ISO, '2046-09-01')).toBe(247);
  });
});

describe('hijriMonthAfter', () => {
  const ISO = '2026-09-01'; // Rabīʿ al-Awwal (month 3), 1448

  it('names the month that many ahead, rolling the year over', () => {
    if (!hijriParts(ISO)) return;
    expect(hijriMonthAfter(ISO, 0)).toEqual({ monthName: 'Rabīʿ al-Awwal', year: 1448 });
    expect(hijriMonthAfter(ISO, 6)).toEqual({ monthName: 'Ramaḍān', year: 1448 });
    expect(hijriMonthAfter(ISO, 12)).toEqual({ monthName: 'Rabīʿ al-Awwal', year: 1449 });
  });

  it('walks backwards for a negative count', () => {
    if (!hijriParts(ISO)) return;
    expect(hijriMonthAfter(ISO, -3)).toEqual({ monthName: 'Dhū al-Ḥijjah', year: 1447 });
  });

  // The inverse of hijriMonthsBetween, which is what lets an arrival be computed in one step
  // rather than by stepping a month at a time through the calendar.
  it('inverts hijriMonthsBetween', () => {
    if (!hijriParts(ISO)) return;
    const months = hijriMonthsBetween(ISO, '2046-09-01');
    expect(hijriMonthAfter(ISO, months!)).toEqual({ monthName: 'Shawwāl', year: 1468 });
  });
});
