export const INSIGHT_MODEL = '@cf/google/gemma-4-26b-a4b-it' as const
export const INSIGHT_PROMPT_VERSION = 3

export type QuarterHabitMetric = {
  id: string
  earned: number
  possible: number
}

/**
 * One open goal, as numbers only — the title and the unit are read from the database here, exactly
 * as habit names are. `earned` is a position for a falling goal and a sum for a climbing one, which
 * is why `direction` travels with it: without that flag "82.4 of 75" is unreadable.
 */
export type GoalMetric = {
  id: string
  target: number
  direction: 'up' | 'down'
  earned: number
  remaining: number
  /** What this lunar month asks for, fixed at its start. `null` once the goal is met or unmeasured. */
  quota: number | null
  quotaRemaining: number | null
  monthsLeft: number
  /** The mean of the last closed months. `null` means no closed month yet — not zero. */
  pace: number | null
  measured: boolean
  met: boolean
  overdue: boolean
}

export type InsightRequest = {
  calendar: {
    hijriOffset: -2 | -1 | 0 | 1 | 2
    /** Minutes east of UTC at request time (the inverse of Date#getTimezoneOffset). */
    utcOffsetMinutes: number
  }
  reading: {
    id: string
    publishedISO: string
    span: { startISO: string; endISO: string; days: number; milestone: 1 | 8 | 15 | 22 }
    quarter: { earned: number; possible: number; rate: number; sealedDays: number; longestRunDays: number }
    previous: { earned: number; possible: number; rate: number } | null
    habits: QuarterHabitMetric[]
  }
  /** Absent on app builds older than this endpoint, which is why it is not optional here: it is
   *  normalised to an empty list rather than rejected, so an old client keeps getting insights. */
  goals: GoalMetric[]
}

export type GeneratedInsight = {
  paragraphs: [string, string, string]
  next_step: string
  evidence_preset_id: string | null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const READING_ID = /^(\d+)-(1[0-2]|[1-9])-(1|8|15|22)$/

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const finite = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

function metric(value: unknown) {
  const item = record(value)
  if (!item || !finite(item.earned, 0, 100_000) || !finite(item.possible, 0, 100_000)) return null
  if (!finite(item.rate, 0, 1)) return null
  return { earned: item.earned as number, possible: item.possible as number, rate: item.rate as number }
}

/** A measure, a count of months, a pace — all of them bounded, none of them free text. */
const MEASURE_LIMIT = 10_000_000

const measure = (value: unknown) => finite(value, -MEASURE_LIMIT, MEASURE_LIMIT)
const nullableMeasure = (value: unknown) => value === null || measure(value)

/**
 * The open goals, validated the way `reading.habits` is: bounded numbers, unique ids, a hard cap
 * on how many. Absent is empty — an app built before this field existed must keep working — but
 * anything PRESENT and malformed is a rejection, because a half-read goal in the prompt is worse
 * than no goal at all.
 */
function goalMetrics(value: unknown): GoalMetric[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 50) return null
  const goals: GoalMetric[] = []
  const ids = new Set<string>()
  for (const raw of value) {
    const item = record(raw)
    if (!item || typeof item.id !== 'string' || item.id.length > 80 || ids.has(item.id)) return null
    if (item.direction !== 'up' && item.direction !== 'down') return null
    if (!finite(item.target, 0, MEASURE_LIMIT) || !measure(item.earned) || !finite(item.remaining, 0, MEASURE_LIMIT)) return null
    if (!nullableMeasure(item.quota) || !nullableMeasure(item.quotaRemaining) || !nullableMeasure(item.pace)) return null
    if (!finite(item.monthsLeft, 0, 1000)) return null
    if (typeof item.measured !== 'boolean' || typeof item.met !== 'boolean' || typeof item.overdue !== 'boolean') return null
    ids.add(item.id)
    goals.push({
      id: item.id,
      target: item.target as number,
      direction: item.direction,
      earned: item.earned as number,
      remaining: item.remaining as number,
      quota: item.quota as number | null,
      quotaRemaining: item.quotaRemaining as number | null,
      monthsLeft: item.monthsLeft as number,
      pace: item.pace as number | null,
      measured: item.measured,
      met: item.met,
      overdue: item.overdue,
    })
  }
  return goals
}

function isoDay(iso: string) {
  if (!DATE.test(iso)) return null
  const value = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== iso) return null
  return value
}

function dayDistance(startISO: string, endISO: string) {
  const start = isoDay(startISO)
  const end = isoDay(endISO)
  return start !== null && end !== null ? Math.round((end - start) / 86_400_000) : Number.NaN
}

function hijriCoordinates(iso: string, offset: number) {
  const day = isoDay(iso)
  if (day === null) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    }).formatToParts(new Date(day + offset * 86_400_000 + 43_200_000))
    const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
    return { year: number('year'), month: number('month'), day: number('day') }
  } catch {
    return null
  }
}

/** Strictly validates the small, metric-only envelope supplied by the mobile app. */
export function parseInsightRequest(value: unknown, routeReadingId: string, now = new Date()): InsightRequest | null {
  const root = record(value)
  const calendar = record(root?.calendar)
  const reading = record(root?.reading)
  const span = record(reading?.span)
  const quarter = metric(reading?.quarter)
  const match = typeof reading?.id === 'string' ? READING_ID.exec(reading.id) : null
  if (!calendar || !reading || !span || !quarter || !match || reading.id !== routeReadingId) return null
  if (![-2, -1, 0, 1, 2].includes(calendar.hijriOffset as number)) return null
  if (!Number.isInteger(calendar.utcOffsetMinutes) || !finite(calendar.utcOffsetMinutes, -720, 840)) return null
  if (typeof reading.publishedISO !== 'string' || isoDay(reading.publishedISO) === null) return null
  if (typeof span.startISO !== 'string' || isoDay(span.startISO) === null) return null
  if (typeof span.endISO !== 'string' || isoDay(span.endISO) === null) return null
  if (![1, 8, 15, 22].includes(span.milestone as number)) return null
  const hijri = hijriCoordinates(span.startISO, calendar.hijriOffset as number)
  if (!hijri || hijri.year !== Number(match[1]) || hijri.month !== Number(match[2]) || hijri.day !== Number(match[3])) return null
  if (span.milestone !== Number(match[3])) return null
  if (!finite(span.days, 7, 9) || dayDistance(span.startISO, span.endISO) !== (span.days as number) - 1) return null
  const localToday = new Date(now.getTime() + (calendar.utcOffsetMinutes as number) * 60_000).toISOString().slice(0, 10)
  if (dayDistance(span.endISO, reading.publishedISO) !== 1 || dayDistance(reading.publishedISO, localToday) < 0) return null
  if (dayDistance(span.endISO, localToday) > 400) return null
  if (!finite(reading.quarter && record(reading.quarter)?.sealedDays, 0, 9)) return null
  if (!finite(reading.quarter && record(reading.quarter)?.longestRunDays, 0, 9)) return null
  const previous = reading.previous === null ? null : metric(reading.previous)
  if (reading.previous !== null && !previous) return null
  if (!Array.isArray(reading.habits) || reading.habits.length > 100) return null
  const habits: QuarterHabitMetric[] = []
  const ids = new Set<string>()
  for (const raw of reading.habits) {
    const item = record(raw)
    if (!item || typeof item.id !== 'string' || item.id.length > 80 || ids.has(item.id)) return null
    if (!finite(item.earned, 0, 10_000) || !finite(item.possible, 0, 10_000)) return null
    ids.add(item.id)
    habits.push({ id: item.id, earned: item.earned as number, possible: item.possible as number })
  }
  const earned = habits.reduce((sum, habit) => sum + habit.earned, 0)
  const possible = habits.reduce((sum, habit) => sum + habit.possible, 0)
  if (Math.abs(earned - quarter.earned) > 1e-6 || Math.abs(possible - quarter.possible) > 1e-6) return null
  const expectedRate = possible > 0 ? earned / possible : 0
  if (Math.abs(expectedRate - quarter.rate) > 1e-6) return null
  const goals = goalMetrics(root?.goals)
  if (goals === null) return null
  return {
    calendar: {
      hijriOffset: calendar.hijriOffset as -2 | -1 | 0 | 1 | 2,
      utcOffsetMinutes: calendar.utcOffsetMinutes as number,
    },
    reading: {
      id: reading.id,
      publishedISO: reading.publishedISO,
      span: {
        startISO: span.startISO,
        endISO: span.endISO,
        days: span.days as number,
        milestone: span.milestone as 1 | 8 | 15 | 22,
      },
      quarter: {
        ...quarter,
        sealedDays: record(reading.quarter)!.sealedDays as number,
        longestRunDays: record(reading.quarter)!.longestRunDays as number,
      },
      previous,
      habits,
    },
    goals,
  }
}

const cleanText = (value: unknown, max: number) => {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\n{3,}/g, '\n\n')
  return text.length > 0 && text.length <= max ? text : null
}

export function parseGeneratedInsight(value: unknown, allowedPresetIds: ReadonlySet<string>): GeneratedInsight | null {
  const item = record(value)
  if (!item || !Array.isArray(item.paragraphs) || item.paragraphs.length !== 3) return null
  const paragraphs = item.paragraphs.map((part) => cleanText(part, 700))
  const nextStep = cleanText(item.next_step, 320)
  const evidence = item.evidence_preset_id
  if (paragraphs.some((part) => part === null) || !nextStep) return null
  if (evidence !== null && (typeof evidence !== 'string' || !allowedPresetIds.has(evidence))) return null
  return {
    paragraphs: paragraphs as [string, string, string],
    next_step: nextStep,
    evidence_preset_id: evidence as string | null,
  }
}

export function responseJson(value: unknown) {
  const item = record(value)
  if (!item || !Array.isArray(item.choices)) return null
  const choice = record(item.choices[0])
  const message = record(choice?.message)
  if (typeof message?.content !== 'string') return null
  const raw = message.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}
