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
 * local `Date`: display code and the lunar-update scheduler both build on this, so a day never
 * shifts across a time zone.
 */
export function localDate(iso: string, hour = 0, minute = 0): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/** `iso` shifted by `n` calendar days (`n` may be negative), as `YYYY-MM-DD`. */
export function addDaysISO(iso: string, n: number): string {
  const date = localDate(iso);
  date.setDate(date.getDate() + n); // setDate handles month/year overflow
  return todayLocalISO(date);
}

/** Per-day cache of the weekday (same rationale as {@link hijriPartsCache}): the progress and
 *  stats sweeps ask for the same ≤370 days once per habit per recompute, and each miss costs a
 *  `Date` construction — the schedule check's hottest allocation. Cleared wholesale past the
 *  cap, a leak guard that in practice never fires. */
const weekdayCache = new Map<string, number>();
const WEEKDAY_CACHE_MAX = 4000;

/**
 * Whole days from `from` to `to` (negative when `to` is earlier). Built on {@link localDate}, so
 * both ends are local midnights; `Math.round` absorbs the 23- and 25-hour days a DST crossing puts
 * between them, which plain division would leave at 0.958 or 1.042 of a day.
 */
export function daysBetweenISO(from: string, to: string): number {
  return Math.round((localDate(to).getTime() - localDate(from).getTime()) / 86_400_000);
}

/** Local weekday index for a `YYYY-MM-DD` day: 0=Sunday … 6=Saturday (matches `Date#getDay` and `schedule_days`). */
export function weekdayIndex(iso: string): number {
  let wd = weekdayCache.get(iso);
  if (wd === undefined) {
    if (weekdayCache.size >= WEEKDAY_CACHE_MAX) weekdayCache.clear();
    wd = localDate(iso).getDay();
    weekdayCache.set(iso, wd);
  }
  return wd;
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
 * Days to shift the Umm al-Qura calendar by, for a locale whose moonsighting runs ahead of or
 * behind the tabular reckoning. `+1` means "today is one Hijri day further along". Held here as
 * module state, pushed in by the preferences store — so every consumer of {@link hijriParts}
 * (the displayed date, `scheduledOn`, the progress and stats sweeps, the lunar updates) agrees
 * without any of them having to know the preference exists.
 */
let hijriOffset = 0;

/** Set the Hijri adjustment. Clears the parts cache, which is keyed on the Gregorian day alone
 *  and would otherwise keep serving dates from the previous offset. */
export function setHijriOffset(days: number): void {
  if (days === hijriOffset) return;
  hijriOffset = days;
  hijriPartsCache.clear();
}

/** How an offset reads to the user: signed days, with the untouched calendar named rather than
 *  shown as "0" — the default is a calendar, not an absence of one. */
export function describeHijriOffset(days: number): string {
  if (days === 0) return 'Umm al-Qura';
  return `${days > 0 ? '+' : '−'}${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'}`;
}

/**
 * Numeric Umm al-Qura (Hijri) parts for a `YYYY-MM-DD` day, plus the month name,
 * for month math.
 * `month` is the 1-based Hijri month number; `day` is the 1-based day of that
 * month. Returns `null` on a runtime whose `Intl` lacks the Islamic calendar
 * (it silently resolves to `gregory`), so callers can hide the feature rather
 * than ever compute against a wrong calendar.
 *
 * Honours the user's {@link setHijriOffset} adjustment — this is the app's single
 * Gregorian→Hijri crossing, so nothing downstream can disagree with it.
 */
export function hijriParts(
  iso: string,
  offset = hijriOffset,
): { day: number; month: number; year: number; monthName: string } | null {
  const fmt = getHijriFormatter();
  if (!fmt) return null;
  const cacheKey = `${offset}:${iso}`;
  const hit = hijriPartsCache.get(cacheKey);
  if (hit !== undefined) return hit;
  let result: { day: number; month: number; year: number; monthName: string } | null = null;
  try {
    // The adjustment lands here and nowhere else: shift the day handed to the formatter, and
    // every function built on this one — month ranges, year starts, `scheduledOn` — follows.
    const date = localDate(offset === 0 ? iso : addDaysISO(iso, offset));
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
  hijriPartsCache.set(cacheKey, result);
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


/** One-letter weekday labels indexed 0=Sunday … 6=Saturday — for the schedule picker. */
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Full weekday names on the same 0=Sunday index — the accessible reading of {@link WEEKDAY_LABELS},
 *  whose one-letter forms are ambiguous by design (two S's, two T's). */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * The seven weekday indices in *display* order for a week that begins on `weekStart`
 * (0=Sunday, 1=Monday, 6=Saturday) — e.g. Monday gives `[1,2,3,4,5,6,0]`.
 *
 * Display order only. Stored `schedule_days` stay on the 0=Sunday index everywhere (the DB
 * column, `weekdayIndex`, the notification layer's Expo conversion), so changing where the week
 * starts rearranges what the user sees and touches nothing that was saved.
 */
export function weekOrder(weekStart: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7);
}

/** A new habit's default schedule: every day. */
export const DAILY_SCHEDULE = [0, 1, 2, 3, 4, 5, 6];

/**
 * A human one-line summary of a weekday schedule — "Every day", or the days themselves in the
 * user's own week order ("Mon · Wed · Fri"). The Hijri sibling of this is
 * {@link describeHijriSchedule}.
 *
 * Read where a habit's schedule is stated rather than edited — a loose habit's second line, via
 * {@link import('@/lib/loose-row').habitMetaLine} — so it is short forms and a middot rather than a
 * sentence: it sits under a title, in the same key as an exchange's "instead of" line, and a full
 * "Monday, Wednesday and Friday" would wrap at 360dp.
 *
 * Ordered by `weekStart` for the same reason the weekday bars are: a schedule should read like the
 * user's own calendar. Stored `schedule_days` stay on the 0=Sunday index — this only reorders what
 * is shown.
 */
export function describeWeekdays(scheduleDays: number[], weekStart: number): string {
  const days = new Set(scheduleDays);
  if (days.size === 0) return 'No days'; // not reachable from the editor, but never render a blank
  if (days.size === 7) return 'Every day';
  return weekOrder(weekStart)
    .filter((d) => days.has(d))
    .map((d) => WEEKDAY_NAMES[d]!.slice(0, 3))
    .join(' · ');
}

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
 *  `Date`. Bounded by the number of distinct habits, so no cap needed. Exported for the lifetime
 *  view, which dates the start of the record by the oldest habit's first day. */
const createdDayCache = new Map<string, string>();
export function createdDayISO(createdAt: string): string {
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
 * Single source of truth for the Habits-screen filter and the progress math.
 */
export function scheduledOn(habit: Schedulable, dayISO: string, offset = hijriOffset): boolean {
  const created = habit.created_at ? createdDayISO(habit.created_at) : null;
  if (created != null && created > dayISO) return false; // didn't exist yet
  if (habit.hijri_schedule) {
    const parts = hijriParts(dayISO, offset);
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
