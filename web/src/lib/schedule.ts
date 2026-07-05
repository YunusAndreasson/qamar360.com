/**
 * Scheduling types and display helpers — a minimal port of the mobile app's `dates.ts` (just the
 * parts the web setup phase needs: describing a schedule, not computing which days a habit is due).
 */

/** A Hijri-calendar recurrence — the alternative to weekday `schedule_days`. Matches the DB jsonb. */
export type HijriSchedule = {
  /** Days of the Hijri month (1–30) recurring EVERY month, e.g. [13,14,15] = the White Days. */
  monthDays?: number[]
  /** Specific annual dates, e.g. [{ month: 1, day: 10 }] = 10 Muḥarram (ʿĀshūrāʾ). */
  dates?: { month: number; day: number }[]
  /** Whole Hijri months (1–12), e.g. [9] = Ramaḍān. */
  months?: number[]
}

/** Umm al-Qura month names, 1-based — a fallback if the DB `hijri_months` haven't loaded. */
export const HIJRI_MONTHS = [
  'Muḥarram', 'Ṣafar', 'Rabīʿ al-Awwal', 'Rabīʿ al-Thānī', 'Jumādā al-Awwal', 'Jumādā al-Thānī',
  'Rajab', 'Shaʿbān', 'Ramaḍān', 'Shawwāl', 'Dhū al-Qaʿdah', 'Dhū al-Ḥijjah',
]

/** One-letter weekday labels, 0=Sun … 6=Sat — for the schedule picker. */
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Every day, 0..6 — a new habit's default weekday schedule. */
export const DAILY_SCHEDULE = [0, 1, 2, 3, 4, 5, 6]

function numberList(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b)
  const contiguous = sorted.length > 1 && sorted.every((v, i) => i === 0 || v === sorted[i - 1]! + 1)
  return contiguous ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(', ')
}

/** A one-line summary of a Hijri schedule, e.g. "White Days (13–15)", "Ramaḍān", "9 Dhū al-Ḥijjah". */
export function describeHijriSchedule(hs: HijriSchedule, months: string[] = HIJRI_MONTHS): string {
  const monthName = (m: number) => months[m - 1] ?? `month ${m}`
  const parts: string[] = []
  if (hs.monthDays?.length) {
    const sorted = [...hs.monthDays].sort((a, b) => a - b)
    const white = sorted.length === 3 && sorted[0] === 13 && sorted[1] === 14 && sorted[2] === 15
    parts.push(white ? 'White Days (13–15)' : `Day ${numberList(sorted)} each Hijri month`)
  }
  if (hs.months?.length) parts.push(hs.months.map(monthName).join(', '))
  if (hs.dates?.length) parts.push(hs.dates.map((d) => `${d.day} ${monthName(d.month)}`).join(', '))
  return parts.join(' · ') || 'No Hijri days'
}

/** A one-line summary of a habit/preset schedule — weekly or Hijri. */
export function scheduleSummary(
  schedule: number[],
  hijri?: HijriSchedule | null,
  months: string[] = HIJRI_MONTHS,
): string {
  if (hijri) return describeHijriSchedule(hijri, months)
  const sorted = [...schedule].sort((a, b) => a - b)
  return sorted.length === 7 ? 'Every day' : sorted.map((d) => SHORT_WEEKDAYS[d]).join(', ') || 'No days'
}
