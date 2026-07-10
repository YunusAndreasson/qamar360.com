/**
 * Progress math for the web console, ported from the mobile app (`src/lib/progress.ts`). Completion
 * in this app is shown around a lunar orbit, so a rate (0–1) is expressed in orbit *degrees*, never
 * percent. `computeProgress` is pure (no React / Supabase) so it stays directly unit-testable, and
 * the web-only KPI/per-habit helpers below reuse its exact credit rules.
 */

import { queryOptions } from '@tanstack/react-query'

import type { Tables } from '#/lib/database.types'
import { addDaysISO, hijriMonthRange, hijriParts, hijriYearStart, scheduledOn, todayLocalISO } from '#/lib/dates'
import type { HijriSchedule } from '#/lib/dates'
import type { Habit } from '#/lib/habits'
import { supabaseBrowser } from '#/lib/supabase/client'

/** A full orbit — 100% completion. */
const FULL_CIRCLE_DEGREES = 360

/** Clamp a value into the 0–1 completion range. */
export function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** A completion rate (0–1) as whole orbit degrees — the app's unit for progress. */
export function toDegrees(rate: number): number {
  return Math.round(clamp01(rate) * FULL_CIRCLE_DEGREES)
}

/**
 * The geometry of a progress ring of pixel `size` drawn with `strokeWidth`, filled to `fraction`
 * (0–1). `arc` / `circumference` feed an SVG `strokeDasharray` so every ring lays out identically.
 */
export function ringMetrics(size: number, strokeWidth: number, fraction: number) {
  const clamped = clamp01(fraction)
  const radius = size / 2
  const ringRadius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * ringRadius
  return { clamped, isComplete: clamped >= 1, radius, ringRadius, circumference, arc: circumference * clamped }
}

/** The minimal habit shape {@link computeProgress} needs — `Habit` satisfies it structurally. */
export type ProgressHabit = {
  id: string
  created_at: string | null
  schedule_days: number[]
  hijri_schedule?: HijriSchedule | null
  /** A count-goal target (e.g. 5 pages); a scheduled day earns `count ÷ target` credit. Null = binary. */
  target_count?: number | null
}

/** The completion-row fields the progress math reads. */
export type CompletionRow = Pick<Tables<'habit_completions'>, 'habit_id' | 'completed_at' | 'status' | 'count'>

/** One day of the current Hijri month, for the "This month" grid. */
export type MonthDay = {
  /** Day of the Hijri month, 1-based. */
  day: number
  /** completed / possible for that day, 0–1; 0 when nothing was scheduled. */
  fraction: number
  /** 'past' = before today, 'today' = today, 'future' = not yet reached. */
  state: 'past' | 'today' | 'future'
}

/**
 * This Hijri month: its date (for the moon hero's lunar phase), its completion so far, and its
 * day-by-day shape. `null` when the platform's `Intl` lacks the Islamic calendar.
 */
export type MonthProgress = {
  /** Hijri month name, e.g. "Muharram". */
  monthName: string
  /** Hijri year, e.g. 1448. */
  year: number
  /** Today's day of the Hijri month, 1-based. */
  dayOfMonth: number
  /** Days in this Hijri month (29 or 30). */
  monthLength: number
  /**
   * Whole-month completion so far, 0–1: acts done month-to-date ÷ acts scheduled across the FULL
   * month. The single source of truth for the orbit/degrees — so a perfect day reads as a small
   * slice, and rate 1 (360°) means the whole month is actually complete.
   */
  thisRate: number
  /** Previous Hijri month name, for the pace comparison ("vs last month"). */
  previousMonthName: string
  /**
   * Last month by this same Hijri day, on the same whole-month scale (0–1) — directly comparable
   * to {@link thisRate}.
   */
  previousRate: number
  /** Whether last month was tracked at all (false → the user's first month; hide the pace tick). */
  hasPrevious: boolean
  /** Every day of the month, 1 → last — the per-day cells (future days empty). */
  days: MonthDay[]
}

/** One Hijri month of the current year, for the "This year" trend. */
type YearMonth = {
  /** 1-based Hijri month number (1 = Muharram … 12 = Dhul-Hijjah). */
  month: number
  /** Hijri month name, e.g. "Rajab". */
  monthName: string
  /** Completion rate, 0–1 — full month for the past, whole-month progress for the current, 0 for the future. */
  fraction: number
  /** 'past' = fully elapsed, 'current' = contains today, 'future' = not yet begun. */
  state: 'past' | 'current' | 'future'
}

/** This Hijri year as its 12 months — the "year in moons" strip. `null` when unavailable. */
export type YearProgress = {
  /** Hijri year, e.g. 1448. */
  year: number
  /** Muharram → Dhul-Hijjah, always length 12. */
  months: YearMonth[]
}

/** Everything the Progress screen derives from the raw rows. */
export type ProgressDerived = {
  habitsCount: number
  /** This Hijri month's completion so far — the moon ring, or `null` if unavailable. */
  month: MonthProgress | null
  /** This Hijri year as 12 months — the year trend, or `null` if unavailable. */
  year: YearProgress | null
}

/** date → (habit id → its completion row) for that day, for O(1) credit lookups. */
type RowIndex = Map<string, Map<string, CompletionRow>>

function indexRows(completions: CompletionRow[]): RowIndex {
  const rowByDate: RowIndex = new Map()
  for (const row of completions) {
    let m = rowByDate.get(row.completed_at)
    if (!m) {
      m = new Map()
      rowByDate.set(row.completed_at, m)
    }
    m.set(row.habit_id, row)
  }
  return rowByDate
}

/**
 * One scheduled habit's credit toward a day's rate: `null` = excused (drop from numerator AND
 * denominator); otherwise 0–1. A count goal earns `count ÷ target` (capped at 1); a binary habit
 * earns 1 when 'done', else 0.
 */
function habitCredit(rows: RowIndex, h: ProgressHabit, iso: string): number | null {
  const row = rows.get(iso)?.get(h.id)
  if (row?.status === 'skipped') return null // excused — out of the rate entirely
  if (h.target_count && h.target_count > 0) {
    if (row?.status === 'done') return 1 // reached target
    return clamp01((row?.count ?? 0) / h.target_count) // in-progress count goal
  }
  return row?.status === 'done' ? 1 : 0 // binary
}

/** A day's completion fraction (credit ÷ scheduled, minus excused). */
function dayFraction(rows: RowIndex, habits: readonly ProgressHabit[], iso: string): number {
  let c = 0
  let p = 0
  for (const h of habits) {
    if (!scheduledOn(h, iso)) continue
    const credit = habitCredit(rows, h, iso)
    if (credit === null) continue // excused — out of the rate entirely
    p += 1
    c += credit
  }
  return p ? c / p : 0
}

/** done / possible over an inclusive `[startISO, endISO]` day range (excused acts excluded). */
function tallyRange(
  rows: RowIndex,
  habits: readonly ProgressHabit[],
  startISO: string,
  endISO: string,
): { done: number; possible: number } {
  let done = 0
  let possible = 0
  for (let day = startISO; day <= endISO; day = addDaysISO(day, 1)) {
    for (const h of habits) {
      if (!scheduledOn(h, day)) continue
      const credit = habitCredit(rows, h, day)
      if (credit === null) continue // excused — excluded from done and possible
      possible += 1
      done += credit // count goals add a fraction; binary habits add 1 or 0
    }
  }
  return { done, possible }
}

/** Derive every progress metric from the raw rows. Pure — easy to reason about and test. */
export function computeProgress(
  habits: ProgressHabit[],
  completions: CompletionRow[],
  today: string,
): ProgressDerived {
  const rows = indexRows(completions)

  let month: MonthProgress | null = null
  const thisRange = hijriMonthRange(today)
  if (thisRange) {
    const dayOfMonth = hijriParts(today)?.day ?? 1
    // The ring measures progress through the WHOLE month: numerator = acts completed month-to-date,
    // denominator = every act scheduled across the full month. A single perfect day is a small slice
    // — 360° means the whole month is done, never "100% of what was possible so far".
    const here = tallyRange(rows, habits, thisRange.start, today) // month-to-date → the done count
    const whole = tallyRange(rows, habits, thisRange.start, thisRange.end) // whole month → the denominator
    const previousRange = hijriMonthRange(addDaysISO(thisRange.start, -1))
    const previousLimit = previousRange
      ? addDaysISO(previousRange.start, Math.min(dayOfMonth, previousRange.length) - 1)
      : null
    const previousThrough =
      previousRange && previousLimit ? tallyRange(rows, habits, previousRange.start, previousLimit) : { done: 0, possible: 0 }
    const previousWhole = previousRange ? tallyRange(rows, habits, previousRange.start, previousRange.end) : { done: 0, possible: 0 }
    const days: MonthDay[] = []
    for (let i = 0; i < thisRange.length; i += 1) {
      const iso = addDaysISO(thisRange.start, i)
      const state: MonthDay['state'] = iso < today ? 'past' : iso === today ? 'today' : 'future'
      days.push({ day: i + 1, fraction: state === 'future' ? 0 : dayFraction(rows, habits, iso), state })
    }
    month = {
      monthName: thisRange.monthName,
      year: thisRange.year,
      dayOfMonth,
      monthLength: thisRange.length,
      thisRate: whole.possible > 0 ? here.done / whole.possible : 0,
      previousMonthName: previousRange?.monthName ?? '',
      previousRate: previousWhole.possible > 0 ? previousThrough.done / previousWhole.possible : 0,
      hasPrevious: previousWhole.possible > 0,
      days,
    }
  }

  // This Hijri year as its 12 months — Muharram → Dhul-Hijjah. Past months carry their full rate,
  // the current month its whole-month progress (done-to-date over the whole month), future months
  // are empty (new moons).
  let year: YearProgress | null = null
  const yearStart = hijriYearStart(today)
  if (yearStart) {
    const months: YearMonth[] = []
    let cursor = yearStart.start
    for (let m = 1; m <= 12; m += 1) {
      const range = hijriMonthRange(cursor)
      if (!range) break
      let state: YearMonth['state']
      let tally = { done: 0, possible: 0 }
      if (range.start > today) {
        state = 'future'
      } else if (range.end <= today) {
        state = 'past'
        tally = tallyRange(rows, habits, range.start, range.end) // a fully elapsed month — full-month rate
      } else {
        state = 'current'
        // Same whole-month denominator as the month ring, so the current moon fills gradually.
        tally = { done: tallyRange(rows, habits, range.start, today).done, possible: tallyRange(rows, habits, range.start, range.end).possible }
      }
      months.push({ month: m, monthName: range.monthName, fraction: tally.possible ? tally.done / tally.possible : 0, state })
      cursor = addDaysISO(range.end, 1) // the 1st of the next Hijri month
    }
    if (months.length === 12) year = { year: yearStart.year, months }
  }

  return { habitsCount: habits.length, month, year }
}

// ── Web-only derived stats (the mobile Progress screen doesn't surface these) ────────────────────

/** The completion rate (0–1) over the last `windowDays` days, ending today. */
export function rollingRate(
  habits: ProgressHabit[],
  completions: CompletionRow[],
  today: string,
  windowDays: number,
): number {
  const rows = indexRows(completions)
  const start = addDaysISO(today, -(windowDays - 1))
  const { done, possible } = tallyRange(rows, habits, start, today)
  return possible > 0 ? done / possible : 0
}

/**
 * The current streak: consecutive days ending today that were fully completed. Rest days (nothing
 * scheduled, or every act excused) bridge the streak without adding to it; an in-progress *today*
 * doesn't break it (the count simply resumes from yesterday); the first incomplete past day ends it.
 */
export function computeStreak(habits: ProgressHabit[], completions: CompletionRow[], today: string): number {
  if (habits.length === 0) return 0
  const rows = indexRows(completions)
  let streak = 0
  let day = today
  for (let i = 0; i < 500; i += 1) {
    const { done, possible } = tallyRange(rows, habits, day, day)
    if (possible === 0) {
      day = addDaysISO(day, -1) // a rest day — bridges without counting
      continue
    }
    if (done >= possible - 1e-9) {
      streak += 1 // a fully completed day
      day = addDaysISO(day, -1)
      continue
    }
    if (day === today) {
      day = addDaysISO(day, -1) // today may just be in progress — don't break, resume from yesterday
      continue
    }
    break // an incomplete past day ends the streak
  }
  return streak
}

/** The best day of the current Hijri month so far (highest fraction among past/today days). */
export function bestDayThisMonth(month: MonthProgress | null): { day: number; fraction: number } | null {
  if (!month) return null
  let best: { day: number; fraction: number } | null = null
  for (const d of month.days) {
    if (d.state === 'future') continue
    if (!best || d.fraction > best.fraction) best = { day: d.day, fraction: d.fraction }
  }
  return best
}

/** Per-habit rate + due-day series over the last `windowDays`, for the "By habit" small multiples. */
export type HabitStat = {
  id: string
  name: string
  /** Completion rate over the window (done ÷ scheduled), 0–1. */
  rate: number
  /** One point per *scheduled* day in the window: its credit (0–1) — the sparkline series. */
  series: { iso: string; fraction: number }[]
}

export function computeHabitStats(
  habits: (ProgressHabit & { name: string })[],
  completions: CompletionRow[],
  today: string,
  windowDays: number,
): HabitStat[] {
  const rows = indexRows(completions)
  const start = addDaysISO(today, -(windowDays - 1))
  return habits.map((h) => {
    const series: { iso: string; fraction: number }[] = []
    let done = 0
    let possible = 0
    for (let day = start; day <= today; day = addDaysISO(day, 1)) {
      if (!scheduledOn(h, day)) continue // only the days this habit was due
      const credit = habitCredit(rows, h, day)
      if (credit === null) continue // excused
      possible += 1
      done += credit
      series.push({ iso: day, fraction: credit })
    }
    return { id: h.id, name: h.name, rate: possible > 0 ? done / possible : 0, series }
  })
}

// ── Data layer ──────────────────────────────────────────────────────────────────────────────────

/** The raw rows the Progress page derives everything from. */
export type ProgressData = { habits: Habit[]; completions: CompletionRow[] }

/** ~370 days — this Hijri year so far plus a little margin, matching the mobile Progress window. */
const WINDOW_DAYS = 370

/**
 * Habits + this-year's completion rows, fetched client-side via `supabaseBrowser` (RLS scopes to
 * the user). Mirrors the mobile `use-progress` hook. The page derives `computeProgress` + the stat
 * helpers from the result, so the Hijri `Intl` math runs in the browser (full ICU).
 */
export const progressQueryOptions = () =>
  queryOptions({
    queryKey: ['progress'],
    queryFn: async (): Promise<ProgressData> => {
      const since = addDaysISO(todayLocalISO(), -(WINDOW_DAYS - 1))
      const [habitsRes, completionsRes] = await Promise.all([
        supabaseBrowser.from('habits').select('*').order('position'),
        supabaseBrowser
          .from('habit_completions')
          .select('habit_id, completed_at, status, count')
          .gte('completed_at', since),
      ])
      if (habitsRes.error) throw habitsRes.error
      if (completionsRes.error) throw completionsRes.error
      return {
        habits: (habitsRes.data ?? []) as Habit[],
        completions: (completionsRes.data ?? []) as CompletionRow[],
      }
    },
  })
