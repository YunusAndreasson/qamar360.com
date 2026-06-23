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
