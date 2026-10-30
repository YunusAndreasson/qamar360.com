/**
 * The moon as the app reckons it, ported from the app's `src/lib/moon.ts` and `src/lib/dates.ts`
 * so the site draws exactly the phase the app would for the same day.
 */

/** Umm al-Qura month names, 1-based (index 0 is Muḥarram), spelled as in the app. */
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
 * The lit fraction for a day of the lunar month: 0 at the new moon, 1 at the full moon, a true
 * cosine between. `dayOfMonth` may be fractional, which lets a scroll sweep the phase smoothly.
 */
export function moonIllumination(dayOfMonth: number, monthLength: number): { illumination: number; waxing: boolean } {
  const p = monthLength > 0 ? (dayOfMonth - 1) / monthLength : 0
  const illumination = (1 - Math.cos(2 * Math.PI * p)) / 2
  return { illumination, waxing: p <= 0.5 }
}

/**
 * The moon as it is seen on the evening of a day, for drawing. `moonIllumination` puts the new
 * moon exactly on the 1st, but on the evening of the 1st a crescent is already up (that is how the
 * month is sighted), so the drawing runs two days ahead: a crescent about 4% lit, as first-sighted
 * crescents are. At 1.3 days (2% lit) it was true but drew as a 3px hairline on a dark disc, which
 * read as no crescent at all. Past the month's end it comes round to the next month's first
 * crescent.
 */
const CRESCENT_LEAD = 2

export function eveningPhase(dayOfMonth: number, monthLength: number): { illumination: number; waxing: boolean } {
  const p = ((((dayOfMonth - 1 + CRESCENT_LEAD) / monthLength) % 1) + 1) % 1
  return { illumination: (1 - Math.cos(2 * Math.PI * p)) / 2, waxing: p <= 0.5 }
}

/** The sun's direction in the moon's frame: x across the disc, z toward the viewer. */
export function sunDirection(illumination: number, waxing: boolean): [number, number, number] {
  const z = 2 * illumination - 1
  const x = Math.sqrt(Math.max(0, 1 - z * z))
  return [waxing ? x : -x, 0, z]
}

export type HijriDate = { day: number; month: number; year: number; monthName: string; monthLength: number }

let formatter: Intl.DateTimeFormat | null | undefined

function hijriFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    })
    formatter = fmt.resolvedOptions().calendar.startsWith('islamic') ? fmt : null
  } catch {
    formatter = null
  }
  return formatter
}

function parts(fmt: Intl.DateTimeFormat, date: Date) {
  const all = fmt.formatToParts(date)
  const num = (type: string) => Number(all.find((p) => p.type === type)?.value)
  return { day: num('day'), month: num('month'), year: num('year') }
}

/**
 * The Umm al-Qura date for a day, with its month's length, or null where `Intl` has no Islamic
 * calendar. The length is found by walking forward to the next 1st; the tabular calendar has
 * 29- and 30-day months.
 */
export function hijriDate(date: Date): HijriDate | null {
  const fmt = hijriFormatter()
  if (!fmt) return null
  const today = parts(fmt, date)
  if (!Number.isFinite(today.day) || !Number.isFinite(today.month)) return null
  let monthLength = today.day
  for (let ahead = 1; ahead <= 31; ahead++) {
    const next = parts(fmt, new Date(date.getTime() + ahead * 86_400_000))
    if (next.day === 1) break
    monthLength = next.day
  }
  return { ...today, monthName: HIJRI_MONTHS[today.month - 1], monthLength }
}

/** The month after a Hijri date's, and how many days until its 1st: 1 on the month's last day.
 *  The count is the calendar's, as the app's is, never a sighting. */
export function nextMonth(date: HijriDate): { name: string; days: number } {
  return { name: HIJRI_MONTHS[date.month % 12], days: date.monthLength - date.day + 1 }
}
