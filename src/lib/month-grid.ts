/**
 * A Gregorian month laid out as weeks, for a calendar the app draws itself.
 *
 * Each week is seven slots, starting on the user's week start; a slot is a day of the month or
 * `null` where the month has not begun or has already ended. Blank rather than the neighbouring
 * month's days, because every day here carries its moon, and a column of borrowed moons either side
 * would show the phases of days that are not in the month being read.
 */
export type GridDay = { iso: string; day: number };

/** `YYYY-MM-DD` for a local calendar date. */
function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `month` is 0-based, as `Date` counts. `weekStart` is the weekday a row begins on (0 = Sunday). */
export function monthGrid(year: number, month: number, weekStart: number): (GridDay | null)[][] {
  const length = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
  const slots: (GridDay | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1) slots.push({ iso: isoOf(year, month, day), day });
  while (slots.length % 7 !== 0) slots.push(null);
  const weeks: (GridDay | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
  return weeks;
}

/** The year and 0-based month a `YYYY-MM-DD` falls in. */
export function monthOf(iso: string): { year: number; month: number } {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
}

/** The month `by` months on from `year`/`month`. */
export function stepMonth({ year, month }: { year: number; month: number }, by: number): { year: number; month: number } {
  const total = year * 12 + month + by;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}
