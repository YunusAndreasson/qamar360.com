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
