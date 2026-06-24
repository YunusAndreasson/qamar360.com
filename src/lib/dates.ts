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

/** Parse a `YYYY-MM-DD` string into a Date at *local* midnight. */
function parseLocalISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  // Construct at local midnight so the weekday/day match the local date.
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** Public: a `YYYY-MM-DD` string as a local-midnight `Date` — for native date pickers. */
export function isoToLocalDate(iso: string): Date {
  return parseLocalISO(iso);
}

/** Human header for a `YYYY-MM-DD` day, e.g. "Monday, 23 June". */
export function formatDayHeader(iso: string): string {
  return parseLocalISO(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** `iso` shifted by `n` calendar days (`n` may be negative), as `YYYY-MM-DD`. */
export function addDaysISO(iso: string, n: number): string {
  const date = parseLocalISO(iso);
  date.setDate(date.getDate() + n); // setDate handles month/year overflow
  return todayLocalISO(date);
}

/** The last `n` local dates ending today, oldest first — n=7 → [today-6 … today]. */
export function lastNDaysISO(n: number): string[] {
  const today = todayLocalISO();
  return Array.from({ length: n }, (_, i) => addDaysISO(today, i - (n - 1)));
}

/** Locale-aware one-letter weekday for a `YYYY-MM-DD` day, e.g. "M". */
export function weekdayInitial(iso: string): string {
  return parseLocalISO(iso).toLocaleDateString(undefined, { weekday: 'narrow' });
}

/** Local weekday index for a `YYYY-MM-DD` day: 0=Sunday … 6=Saturday (matches `Date#getDay` and `schedule_days`). */
export function weekdayIndex(iso: string): number {
  return parseLocalISO(iso).getDay();
}

/** Full local weekday name for a `YYYY-MM-DD` day, e.g. "Monday". */
export function weekdayLong(iso: string): string {
  return parseLocalISO(iso).toLocaleDateString(undefined, { weekday: 'long' });
}

/** Day-and-month for a `YYYY-MM-DD` day, e.g. "21 June". */
export function formatMonthDay(iso: string): string {
  return parseLocalISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

/**
 * Compact inclusive day range, e.g. "18–24 Jun" (same month) or "28 May – 3 Jun"
 * (across months). Day order is fixed (only the month name is locale-formatted),
 * so it never renders as the US "Jun 24".
 */
export function formatDayRange(startISO: string, endISO: string): string {
  const start = parseLocalISO(startISO);
  const end = parseLocalISO(endISO);
  const endMonth = end.toLocaleDateString(undefined, { month: 'short' });
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${endMonth}`;
  }
  const startMonth = start.toLocaleDateString(undefined, { month: 'short' });
  return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
}

/**
 * The Islamic (Hijri) date for a `YYYY-MM-DD` day, e.g. "9 Muharram 1448 AH" —
 * a fitting touch for a moon-named tracker. Uses the Umm al-Qura calendar via
 * the platform's `Intl`/ICU (no conversion math of our own, so it stays
 * accurate). Returns `null` on a runtime whose `Intl` lacks the Islamic
 * calendar (it silently resolves to `gregory`), so callers can simply hide the
 * line rather than ever show a wrong date. Day/month/year are reassembled from
 * parts so the order is stable regardless of locale.
 */
export function formatHijriDate(iso: string): string | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (!fmt.resolvedOptions().calendar.startsWith('islamic')) return null;
    const parts = fmt.formatToParts(parseLocalISO(iso));
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    const day = pick('day');
    const month = pick('month');
    const year = pick('year');
    if (!day || !month || !year) return null;
    return `${day} ${month} ${year} AH`;
  } catch {
    return null;
  }
}

/**
 * Numeric Umm al-Qura (Hijri) parts for a `YYYY-MM-DD` day, plus the long month
 * name — the structured counterpart to {@link formatHijriDate}, for month math.
 * `month` is the 1-based Hijri month number; `day` is the 1-based day of that
 * month. Returns `null` on a runtime whose `Intl` lacks the Islamic calendar
 * (it silently resolves to `gregory`), so callers can hide the feature rather
 * than ever compute against a wrong calendar.
 */
export function hijriParts(
  iso: string,
): { day: number; month: number; year: number; monthName: string } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    if (!fmt.resolvedOptions().calendar.startsWith('islamic')) return null;
    const date = parseLocalISO(iso);
    const parts = fmt.formatToParts(date);
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    const day = Number(pick('day'));
    const month = Number(pick('month'));
    const year = Number(pick('year'));
    if (!day || !month || !year) return null;
    const monthName =
      new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'long' })
        .formatToParts(date)
        .find((p) => p.type === 'month')?.value ?? '';
    return { day, month, year, monthName };
  } catch {
    return null;
  }
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
 * The Gregorian date (`YYYY-MM-DD`) of 1 Muharram — the first day of the Hijri
 * year that contains `iso` — plus that Hijri year. Walks back month by month
 * from the current Hijri month to Muharram (month 1). Returns `null` when the
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

/** The minimal habit shape {@link scheduledOn} needs — `Habit` satisfies it structurally. */
type Schedulable = { created_at: string | null; schedule_days: number[] };

/**
 * Whether a habit "counts" on day `D`: it must already have existed (created on or
 * before `D`, or creation unknown) *and* `D`'s weekday must be in its schedule.
 * Single source of truth for the Habits-screen filter, progress math, and reminders.
 */
export function scheduledOn(habit: Schedulable, dayISO: string): boolean {
  const created = habit.created_at ? todayLocalISO(new Date(habit.created_at)) : null;
  if (created != null && created > dayISO) return false; // didn't exist yet
  return habit.schedule_days.includes(weekdayIndex(dayISO));
}

/** Parse a stored `'HH:MM'` reminder into numeric parts, or null when unset/invalid. */
export function parseReminderTime(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

/** Format hour/minute into the stored `'HH:MM'` 24-hour string. */
export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Human reminder label for an `'HH:MM'` string, e.g. "8:30 AM" — locale-aware. */
export function formatReminderLabel(value: string): string {
  const time = parseReminderTime(value);
  if (!time) return '';
  const date = new Date();
  date.setHours(time.hour, time.minute, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
