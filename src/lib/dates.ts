/**
 * Date helpers for the habit tracker.
 *
 * Daily completions are keyed on a *local* calendar date. `Date#toISOString()`
 * returns a UTC date, which rolls over a day early/late for users in non-UTC
 * time zones near midnight — so we build the `YYYY-MM-DD` string from the local
 * date parts instead, and parse it back into a local Date for display.
 */

/** Local calendar date as `YYYY-MM-DD` — matches the `completed_at` column. */
export function todayLocalISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A `Date` at local `hour:minute` on the given `YYYY-MM-DD` day — local midnight by default, so the
 * weekday/day match the local date. The one place a completion date-string is turned back into a
 * local `Date`: display code and the reminder scheduler both build on this, so a day never shifts
 * across a time zone.
 */
export function localDate(iso: string, hour = 0, minute = 0): Date {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/** `iso` shifted by `n` calendar days (`n` may be negative), as `YYYY-MM-DD`. */
export function addDaysISO(iso: string, n: number): string {
  const date = localDate(iso);
  date.setDate(date.getDate() + n); // setDate handles month/year overflow
  return todayLocalISO(date);
}

/** Local weekday index for a `YYYY-MM-DD` day: 0=Sunday … 6=Saturday (matches `Date#getDay` and `schedule_days`). */
export function weekdayIndex(iso: string): number {
  return localDate(iso).getDay();
}

/**
 * Umm al-Qura month names, 1-based (index 0 is Muḥarram). We name the month from
 * its *numeric* value ourselves rather than trust `Intl`'s long month name:
 * Hermes/iOS routinely returns an empty string for `islamic-umalqura`
 * `month: 'long'` (the number still resolves), which left the Progress hero
 * showing just the year. Mapping from the number renders the name identically on
 * every engine.
 */
export const HIJRI_MONTHS = [
  'Muḥarram',
  'Ṣafar',
  'Rabīʿ al-Awwal',
  'Rabīʿ al-Thānī',
  'Jumādā al-Awwal',
  'Jumādā al-Thānī',
  'Rajab',
  'Shaʿbān',
  'Ramaḍān',
  'Shawwāl',
  'Dhū al-Qaʿdah',
  'Dhū al-Ḥijjah',
] as const;

/**
 * The Umm al-Qura formatter, built once and reused: constructing an `Intl.DateTimeFormat` is
 * relatively expensive and {@link hijriParts} runs across a whole year of days per Progress
 * render. `null` = this runtime's `Intl` lacks the Islamic calendar (it silently resolves to
 * `gregory`); `undefined` = not yet probed. The formatter is stateless across dates, so reusing
 * it for many `formatToParts` calls is safe (and the recommended pattern).
 */
let hijriFormatter: Intl.DateTimeFormat | null | undefined;
function getHijriFormatter(): Intl.DateTimeFormat | null {
  if (hijriFormatter !== undefined) return hijriFormatter;
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    hijriFormatter = fmt.resolvedOptions().calendar.startsWith('islamic') ? fmt : null;
  } catch {
    hijriFormatter = null;
  }
  return hijriFormatter;
}

/** Per-day cache of the Umm al-Qura parts. The progress math sweeps whole Hijri years day by
 *  day for every habit, and the toggle path re-asks for the same day per Hijri habit — each
 *  miss costs an Intl `formatToParts`, the single most expensive call in that loop. A day's
 *  parts never change, so the cache is a pure lookup. Cleared wholesale past the cap (several
 *  years of distinct days) — a leak guard that in practice never fires. */
const hijriPartsCache = new Map<string, { day: number; month: number; year: number; monthName: string } | null>();
const HIJRI_PARTS_CACHE_MAX = 4000;

/**
 * Numeric Umm al-Qura (Hijri) parts for a `YYYY-MM-DD` day, plus the month name,
 * for month math.
 * `month` is the 1-based Hijri month number; `day` is the 1-based day of that
 * month. Returns `null` on a runtime whose `Intl` lacks the Islamic calendar
 * (it silently resolves to `gregory`), so callers can hide the feature rather
 * than ever compute against a wrong calendar.
 */
export function hijriParts(
  iso: string,
): { day: number; month: number; year: number; monthName: string } | null {
  const fmt = getHijriFormatter();
  if (!fmt) return null;
  const hit = hijriPartsCache.get(iso);
  if (hit !== undefined) return hit;
  let result: { day: number; month: number; year: number; monthName: string } | null = null;
  try {
    const date = localDate(iso);
    const parts = fmt.formatToParts(date);
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    const day = Number(pick('day'));
    const month = Number(pick('month'));
    const year = Number(pick('year'));
    if (day && month && year) {
      result = { day, month, year, monthName: HIJRI_MONTHS[month - 1] ?? '' };
    }
  } catch {
    result = null;
  }
  if (hijriPartsCache.size >= HIJRI_PARTS_CACHE_MAX) hijriPartsCache.clear();
  hijriPartsCache.set(iso, result);
  return result;
}

/**
 * The Gregorian span of the Hijri month that contains `iso`: `start`/`end` as
 * inclusive `YYYY-MM-DD`, the month `length` (29 or 30), the month name, and the
 * Hijri `year`. Built purely from {@link hijriParts} + day arithmetic — no
 * conversion math of our own, so it stays accurate. Returns `null` when the
 * Islamic calendar is unavailable.
 */
export function hijriMonthRange(
  iso: string,
): { start: string; end: string; length: number; monthName: string; year: number } | null {
  const parts = hijriParts(iso);
  if (!parts) return null;
  const start = addDaysISO(iso, -(parts.day - 1)); // back up to the 1st of this Hijri month
  // Umm al-Qura months run 29 or 30 days. Day 30 would land 29 days after the
  // 1st; if that day is still the same Hijri month, the month is 30 days long.
  const probe = hijriParts(addDaysISO(start, 29));
  const length = probe && probe.month === parts.month && probe.year === parts.year ? 30 : 29;
  const end = addDaysISO(start, length - 1);
  return { start, end, length, monthName: parts.monthName, year: parts.year };
}

/**
 * The Gregorian date (`YYYY-MM-DD`) of 1 Muḥarram — the first day of the Hijri
 * year that contains `iso` — plus that Hijri year. Walks back month by month
 * from the current Hijri month to Muḥarram (month 1). Returns `null` when the
 * Islamic calendar is unavailable.
 */
export function hijriYearStart(iso: string): { start: string; year: number } | null {
  const p = hijriParts(iso);
  if (!p) return null;
  let first = addDaysISO(iso, -(p.day - 1)); // 1st of the current Hijri month
  let mp = hijriParts(first);
  for (let guard = 0; mp && mp.month !== 1 && guard < 13; guard += 1) {
    const prevMonthLast = addDaysISO(first, -1);
    const pp = hijriParts(prevMonthLast);
    if (!pp) return null;
    first = addDaysISO(prevMonthLast, -(pp.day - 1)); // 1st of the previous Hijri month
    mp = hijriParts(first);
  }
  return mp && mp.month === 1 ? { start: first, year: mp.year } : null;
}

/** One-letter weekday labels indexed 0=Sunday … 6=Saturday — for the schedule picker. */
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** A new habit's default schedule: every day. */
export const DAILY_SCHEDULE = [0, 1, 2, 3, 4, 5, 6];

/**
 * A Hijri-calendar recurrence, the alternative to `schedule_days`. A habit is
 * Hijri-scheduled iff it carries one of these (stored in `habits.hijri_schedule`);
 * otherwise it uses the weekday `schedule_days`. All keys optional — a day counts
 * if it matches any of them. Lets us express the Sunnah practices a weekday schedule
 * can't: the White Days, ʿĀshūrāʾ, ʿArafah, Ramaḍān.
 */
export type HijriSchedule = {
  /** Days of the Hijri month (1–30) that recur EVERY month, e.g. [13, 14, 15] = the White Days. */
  monthDays?: number[];
  /** Specific annual dates, e.g. [{ month: 1, day: 10 }] = 10 Muḥarram (ʿĀshūrāʾ). */
  dates?: { month: number; day: number }[];
  /** Whole Hijri months (1–12), e.g. [9] = Ramaḍān. */
  months?: number[];
};

/** True if a Hijri schedule places a habit on the day with Hijri parts `p`. */
function hijriScheduleMatches(hs: HijriSchedule, p: { day: number; month: number }): boolean {
  return (
    (hs.monthDays?.includes(p.day) ?? false) ||
    (hs.months?.includes(p.month) ?? false) ||
    (hs.dates?.some((d) => d.month === p.month && d.day === p.day) ?? false)
  );
}

/** The minimal habit shape {@link scheduledOn} needs — `Habit` satisfies it structurally. */
type Schedulable = { created_at: string | null; schedule_days: number[]; hijri_schedule?: HijriSchedule | null };

/** created_at timestamp → its local `YYYY-MM-DD`, cached: {@link scheduledOn} runs per
 *  habit × day across whole-year sweeps, and each miss re-parses the same timestamp into a
 *  `Date`. Bounded by the number of distinct habits, so no cap needed. */
const createdDayCache = new Map<string, string>();
function createdDayISO(createdAt: string): string {
  let day = createdDayCache.get(createdAt);
  if (day === undefined) {
    day = todayLocalISO(new Date(createdAt));
    createdDayCache.set(createdAt, day);
  }
  return day;
}

/**
 * Whether a habit "counts" on day `D`: it must already have existed (created on or
 * before `D`, or creation unknown) *and* `D` must fall on its schedule — its Hijri
 * recurrence when it has one, otherwise `D`'s weekday must be in `schedule_days`.
 * Single source of truth for the Habits-screen filter, progress math, and reminders.
 */
export function scheduledOn(habit: Schedulable, dayISO: string): boolean {
  const created = habit.created_at ? createdDayISO(habit.created_at) : null;
  if (created != null && created > dayISO) return false; // didn't exist yet
  if (habit.hijri_schedule) {
    const parts = hijriParts(dayISO);
    if (!parts) return false; // no Islamic calendar on this runtime — can't place a Hijri habit
    return hijriScheduleMatches(habit.hijri_schedule, parts);
  }
  return habit.schedule_days.includes(weekdayIndex(dayISO));
}

/** Join a list of numbers as a range when contiguous ("13–15"), else a comma list ("1, 14"). */
function numberList(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const contiguous = sorted.length > 1 && sorted.every((v, i) => i === 0 || v === sorted[i - 1]! + 1);
  return contiguous ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(', ');
}

/**
 * A human one-line summary of a {@link HijriSchedule}, e.g. "White Days (13–15)",
 * "Ramaḍān", "9–10 Muḥarram". Used wherever a Hijri habit's schedule is shown.
 */
export function describeHijriSchedule(hs: HijriSchedule): string {
  const parts: string[] = [];
  if (hs.monthDays?.length) {
    const sorted = [...hs.monthDays].sort((a, b) => a - b);
    const isWhiteDays = sorted.length === 3 && sorted[0] === 13 && sorted[1] === 14 && sorted[2] === 15;
    parts.push(isWhiteDays ? 'White Days (13–15)' : `Day ${numberList(sorted)} each Hijri month`);
  }
  if (hs.months?.length) {
    parts.push(hs.months.map((m) => HIJRI_MONTHS[m - 1] ?? `month ${m}`).join(', '));
  }
  if (hs.dates?.length) {
    parts.push(
      hs.dates.map((d) => `${d.day} ${HIJRI_MONTHS[d.month - 1] ?? `month ${d.month}`}`).join(', '),
    );
  }
  return parts.join(' · ') || 'No Hijri days';
}

/** Parse a stored `'HH:MM'` reminder into numeric parts, or null when unset/invalid. */
export function parseReminderTime(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const [hourPart, minutePart] = value.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  // A bare "8" (no colon) leaves minutePart undefined → Number(undefined) is NaN;
  // Number.isInteger rejects that, so we never return a half-parsed time.
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return { hour, minute };
}

/** Format hour/minute into the stored `'HH:MM'` 24-hour string. */
export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
