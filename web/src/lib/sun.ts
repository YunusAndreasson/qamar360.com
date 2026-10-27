/**
 * The real sun for one place and day: where it puts the five prayers, so the page can say which
 * comes next. The solar sibling of `moon.ts`, small enough to ship to the browser (the app uses
 * astronomy-engine; this is the standard low-precision solar position, good to about a minute,
 * checked against astronomy-engine in the tests).
 *
 * The prayers are placed by the same definitions the app's prayer acts give
 * (`src/constants/sunnah-habits.ts`): Fajr and ʿIshāʾ with the sun 18° below the horizon, Dhuhr
 * just past the sun's height, ʿAṣr when a shadow equals its object plus the noon shadow, Maghrib
 * at sunset. The page shows no clock time for them, as the app shows none.
 */

const RAD = Math.PI / 180
const DAY_MS = 86_400_000
/** The sun's altitude at sunrise and sunset: its upper limb on the horizon, with refraction. */
const HORIZON = -0.833
/** Fajr and ʿIshāʾ: the sun this far below the horizon. */
const TWILIGHT = -18

export type Place = { lat: number; lon: number }

/** The sun's declination (degrees) and the equation of time (minutes) at an instant. */
function solar(ms: number) {
  const n = ms / DAY_MS + 2440587.5 - 2451545
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const eps = (23.439 - 0.0000004 * n) * RAD
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD
  const eot = ((((L - ra) % 360) + 540) % 360) - 180
  return { decl, eot: eot * 4 }
}

/** Solar noon nearest an instant. */
function solarNoon(ms: number, { lon }: Place) {
  let noon = ms
  // Two passes: the equation of time is read at the noon it helps to find.
  for (let i = 0; i < 2; i++) {
    const day = Math.floor(noon / DAY_MS) * DAY_MS
    noon = day + (720 - 4 * lon - solar(noon).eot) * 60_000
  }
  return noon
}

/** When the sun reaches an altitude before (`-1`) or after (`1`) a noon, or null if it never does. */
function crossing(noon: number, altitude: number, side: -1 | 1, { lat }: Place): number | null {
  let t = noon
  for (let i = 0; i < 3; i++) {
    const { decl } = solar(t)
    const cosH =
      (Math.sin(altitude * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) /
      (Math.cos(lat * RAD) * Math.cos(decl * RAD))
    if (cosH < -1 || cosH > 1) return null
    t = noon + side * (Math.acos(cosH) / RAD) * 4 * 60_000
  }
  return t
}

export type PrayerName = 'Fajr' | 'Dhuhr' | 'ʿAṣr' | 'Maghrib' | 'ʿIshāʾ'

export type SunDay = {
  noon: number
  /** The five prayers in order; Fajr and ʿIshāʾ are null where the sky never darkens to −18°. */
  prayers: { name: PrayerName; at: number | null }[]
}

/** The sun's day round the solar noon nearest `ms`. */
export function sunDay(ms: number, place: Place): SunDay {
  const noon = solarNoon(ms, place)
  const { decl } = solar(noon)
  // ʿAṣr: a shadow as long as its object, on top of the shadow left at noon.
  const asr = Math.atan(1 / (1 + Math.tan(Math.abs(place.lat - decl) * RAD))) / RAD
  return {
    noon,
    prayers: [
      { name: 'Fajr', at: crossing(noon, TWILIGHT, -1, place) },
      // Dhuhr comes once the sun has passed its height, not at the instant itself.
      { name: 'Dhuhr', at: noon + 2 * 60_000 },
      { name: 'ʿAṣr', at: crossing(noon, asr, 1, place) },
      { name: 'Maghrib', at: crossing(noon, HORIZON, 1, place) },
      { name: 'ʿIshāʾ', at: crossing(noon, TWILIGHT, 1, place) },
    ],
  }
}

/** The day to draw at an instant: today's until ʿIshāʾ has passed, then the coming day's. */
export function dayToShow(ms: number, place: Place): SunDay {
  const today = sunDay(ms, place)
  const isha = today.prayers[4].at ?? today.noon + 12 * 3_600_000
  return ms > isha ? sunDay(ms + DAY_MS, place) : today
}

/** The next prayer the sun brings, from an instant. */
export function nextPrayer(ms: number, day: SunDay): PrayerName {
  return day.prayers.find((p) => p.at !== null && p.at > ms)?.name ?? 'Fajr'
}
