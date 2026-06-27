import { describe, expect, it } from '@jest/globals';

import {
  addDaysISO,
  describeHijriSchedule,
  formatReminderTime,
  hijriParts,
  parseReminderTime,
  scheduledOn,
  todayLocalISO,
  weekdayIndex,
} from '@/lib/dates';

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

describe('parseReminderTime / formatReminderTime', () => {
  it('parses a valid HH:MM string', () => {
    expect(parseReminderTime('08:30')).toEqual({ hour: 8, minute: 30 });
    expect(parseReminderTime('8:5')).toEqual({ hour: 8, minute: 5 });
  });

  it('returns null for empty or malformed input', () => {
    expect(parseReminderTime(null)).toBeNull();
    expect(parseReminderTime('')).toBeNull();
    expect(parseReminderTime('abc')).toBeNull();
    // Regression: a bare hour with no minute must not parse to a half-populated time.
    expect(parseReminderTime('8')).toBeNull();
  });

  it('formats and round-trips', () => {
    expect(formatReminderTime(8, 30)).toBe('08:30');
    expect(formatReminderTime(8, 5)).toBe('08:05');
    expect(parseReminderTime(formatReminderTime(21, 0))).toEqual({ hour: 21, minute: 0 });
  });
});

describe('describeHijriSchedule', () => {
  it('names the White Days', () => {
    expect(describeHijriSchedule({ monthDays: [13, 14, 15] })).toBe('White Days (13–15)');
  });

  it('describes months and annual dates', () => {
    expect(describeHijriSchedule({ months: [9] })).toBe('Ramadan');
    expect(describeHijriSchedule({ dates: [{ month: 1, day: 10 }] })).toBe('10 Muharram');
  });

  it('falls back when nothing is set', () => {
    expect(describeHijriSchedule({})).toBe('No Hijri days');
  });
});
