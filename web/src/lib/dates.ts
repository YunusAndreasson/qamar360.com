/**
 * Date + Hijri-calendar math for the web Progress console. A focused port of the mobile app's
 * `src/lib/dates.ts` — the parts the progress charts need: local-date keys, day arithmetic, the
 * Umm al-Qura month math, and `scheduledOn`. Kept pure (only `Intl`/`Date`) so it runs identically
 * in the browser, and `web/src/lib/schedule.ts` re-exports the shared `HijriSchedule`/`HIJRI_MONTHS`
 * from here so there is one source of truth.
 *
 * Daily completions are keyed on a *local* calendar date. `Date#toISOString()` returns a UTC date,
 * which rolls over a day early/late near midnight in non-UTC zones — so we build the `YYYY-MM-DD`
 * string from the local date parts instead, and parse it back into a local Date for display.
 */

/** Local calendar date as `YYYY-MM-DD` — matches the `completed_at` column. */
export function todayLocalISO(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * A `Date` at local `hour:minute` on the given `YYYY-MM-DD` day — local midnight by default, so the
 * weekday/day match the local date. The one place a completion date-string is turned back into a
 * local `Date`, so a day never shifts across a time zone.
 */
export function localDate(iso: string, hour = 0, minute = 0): Date {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

/** `iso` shifted by `n` calendar days (`n` may be negative), as `YYYY-MM-DD`. */
export function addDaysISO(iso: string, n: number): string {
  const date = localDate(iso)
  date.setDate(date.getDate() + n) // setDate handles month/year overflow
  return todayLocalISO(date)
}

/** Local weekday index for a `YYYY-MM-DD` day: 0=Sunday … 6=Saturday (matches `Date#getDay`). */
export function weekdayIndex(iso: string): number {
  return localDate(iso).getDay()
}

/**
 * Umm al-Qura month names, 1-based (index 0 is Muḥarram). We name the month from its *numeric*
 * value ourselves rather than trust `Intl`'s long month name, which some engines return empty for
 * `islamic-umalqura` — mapping from the number renders identically everywhere.
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
] as const

/**
 * The Umm al-Qura formatter, built once and reused: constructing an `Intl.DateTimeFormat` is
 * relatively expensive and {@link hijriParts} runs across a whole year of days per Progress render.
 * `null` = this runtime's `Intl` lacks the Islamic calendar (it silently resolves to `gregory`);
 * `undefined` = not yet probed.
 */
let hijriFormatter: Intl.DateTimeFormat | null | undefined
function getHijriFormatter(): Intl.DateTimeFormat | null {
  if (hijriFormatter !== undefined) return hijriFormatter
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    })
    hijriFormatter = fmt.resolvedOptions().calendar.startsWith('islamic') ? fmt : null
  } catch {
    hijriFormatter = null
  }
  return hijriFormatter
}

/**
 * Numeric Umm al-Qura (Hijri) parts for a `YYYY-MM-DD` day, plus the month name. `month` is the
 * 1-based Hijri month number; `day` is the 1-based day of that month. Returns `null` on a runtime
 * whose `Intl` lacks the Islamic calendar, so callers can hide the feature rather than compute
 * against a wrong calendar.
 */
export function hijriParts(
  iso: string,
): { day: number; month: number; year: number; monthName: string } | null {
  const fmt = getHijriFormatter()
  if (!fmt) return null
  try {
    const date = localDate(iso)
    const parts = fmt.formatToParts(date)
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
    const day = Number(pick('day'))
    const month = Number(pick('month'))
    const year = Number(pick('year'))
    if (!day || !month || !year) return null
    const monthName = HIJRI_MONTHS[month - 1] ?? ''
    return { day, month, year, monthName }
  } catch {
    return null
  }
}

/**
 * A `YYYY-MM-DD` day as an on-brand Hijri date string, e.g. "26 Muḥarram 1448". Returns `null` on a
 * runtime whose `Intl` lacks the Islamic calendar, so callers can fall back to {@link formatGregorian}.
 */
export function formatHijriDate(iso: string): string | null {
  const p = hijriParts(iso)
  return p ? `${p.day} ${p.monthName} ${p.year}` : null
}

/** A `YYYY-MM-DD` day as a long Gregorian date in the viewer's locale, e.g. "11 July 2026". */
export function formatGregorian(iso: string): string {
  return localDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * A `YYYY-MM-DD` day as a short weekday and date, e.g. "Sat, 5 Sep".
 *
 * The form a scheduled row wants: near enough to read at a glance, dated enough to be unambiguous.
 * Deliberately no year — the only rows that reach it are days away, not months.
 */
export function formatDayShort(iso: string): string {
  return localDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * The Gregorian span of the Hijri month that contains `iso`: `start`/`end` as inclusive
 * `YYYY-MM-DD`, the month `length` (29 or 30), the month name, and the Hijri `year`. Built purely
 * from {@link hijriParts} + day arithmetic. Returns `null` when the Islamic calendar is unavailable.
 */
export function hijriMonthRange(
  iso: string,
): { start: string; end: string; length: number; monthName: string; year: number } | null {
  const parts = hijriParts(iso)
  if (!parts) return null
  const start = addDaysISO(iso, -(parts.day - 1)) // back up to the 1st of this Hijri month
  // Umm al-Qura months run 29 or 30 days. Day 30 would land 29 days after the 1st; if that day is
  // still the same Hijri month, the month is 30 days long.
  const probe = hijriParts(addDaysISO(start, 29))
  const length = probe && probe.month === parts.month && probe.year === parts.year ? 30 : 29
  const end = addDaysISO(start, length - 1)
  return { start, end, length, monthName: parts.monthName, year: parts.year }
}

/**
 * The Gregorian date (`YYYY-MM-DD`) of 1 Muḥarram — the first day of the Hijri year that contains
 * `iso` — plus that Hijri year. Walks back month by month from the current Hijri month to Muḥarram.
 * Returns `null` when the Islamic calendar is unavailable.
 */
export function hijriYearStart(iso: string): { start: string; year: number } | null {
  const p = hijriParts(iso)
  if (!p) return null
  let first = addDaysISO(iso, -(p.day - 1)) // 1st of the current Hijri month
  let mp = hijriParts(first)
  for (let guard = 0; mp && mp.month !== 1 && guard < 13; guard += 1) {
    const prevMonthLast = addDaysISO(first, -1)
    const pp = hijriParts(prevMonthLast)
    if (!pp) return null
    first = addDaysISO(prevMonthLast, -(pp.day - 1)) // 1st of the previous Hijri month
    mp = hijriParts(first)
  }
  return mp && mp.month === 1 ? { start: first, year: mp.year } : null
}

/**
 * A Hijri-calendar recurrence, the alternative to `schedule_days`. A habit is Hijri-scheduled iff
 * it carries one of these (stored in `habits.hijri_schedule`); otherwise it uses the weekday
 * `schedule_days`. All keys optional — a day counts if it matches any of them.
 */
export type HijriSchedule = {
  /** Days of the Hijri month (1–30) that recur EVERY month, e.g. [13, 14, 15] = the White Days. */
  monthDays?: number[]
  /** Specific annual dates, e.g. [{ month: 1, day: 10 }] = 10 Muḥarram (ʿĀshūrāʾ). */
  dates?: { month: number; day: number }[]
  /** Whole Hijri months (1–12), e.g. [9] = Ramaḍān. */
  months?: number[]
}

/** True if a Hijri schedule places a habit on the day with Hijri parts `p`. */
function hijriScheduleMatches(hs: HijriSchedule, p: { day: number; month: number }): boolean {
  return (
    (hs.monthDays?.includes(p.day) ?? false) ||
    (hs.months?.includes(p.month) ?? false) ||
    (hs.dates?.some((d) => d.month === p.month && d.day === p.day) ?? false)
  )
}

/** The minimal habit shape {@link scheduledOn} needs — a `Habit` satisfies it structurally. */
type Schedulable = { created_at: string | null; schedule_days: number[]; hijri_schedule?: HijriSchedule | null }

/**
 * Whether a habit "counts" on day `D`: it must already have existed (created on or before `D`, or
 * creation unknown) *and* `D` must fall on its schedule — its Hijri recurrence when it has one,
 * otherwise `D`'s weekday must be in `schedule_days`. Single source of truth for the progress math.
 */
export function scheduledOn(habit: Schedulable, dayISO: string): boolean {
  const created = habit.created_at ? todayLocalISO(new Date(habit.created_at)) : null
  if (created != null && created > dayISO) return false // didn't exist yet
  if (habit.hijri_schedule) {
    const parts = hijriParts(dayISO)
    if (!parts) return false // no Islamic calendar on this runtime — can't place a Hijri habit
    return hijriScheduleMatches(habit.hijri_schedule, parts)
  }
  return habit.schedule_days.includes(weekdayIndex(dayISO))
}
