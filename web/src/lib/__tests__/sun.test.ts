import { describe, expect, it } from 'vitest'

import { dayToShow, isNight, nextPrayer, sunDay } from '../sun'

const STOCKHOLM = { lat: 59.333, lon: 18.05 }
const MECCA = { lat: 21.42, lon: 39.83 }
const TROMSO = { lat: 69.65, lon: 18.96 }
const LOS_ANGELES = { lat: 34.052, lon: -118.243 }
const HONOLULU = { lat: 21.307, lon: -157.858 }
const AUCKLAND = { lat: -36.867, lon: 174.767 }

/** Minutes between an instant and an ISO time (UTC). */
const off = (ms: number | null, iso: string) => (ms === null ? Infinity : Math.abs(ms - Date.parse(`${iso}Z`)) / 60_000)

// References from astronomy-engine (the app's library) for 27 October 2026.
describe('sunDay', () => {
  it('places Fajr, Maghrib and ʿIshāʾ within a minute of astronomy-engine', () => {
    const s = sunDay(Date.parse('2026-10-27T10:00:00Z'), STOCKHOLM)
    expect(off(s.prayers[0].at, '2026-10-27T03:36')).toBeLessThan(1)
    expect(off(s.prayers[3].at, '2026-10-27T15:07')).toBeLessThan(1)
    expect(off(s.prayers[4].at, '2026-10-27T17:25')).toBeLessThan(1)

    const m = sunDay(Date.parse('2026-10-27T09:00:00Z'), MECCA)
    expect(off(m.prayers[0].at, '2026-10-27T02:06')).toBeLessThan(1)
    expect(off(m.prayers[3].at, '2026-10-27T14:47')).toBeLessThan(1)
    expect(off(m.prayers[4].at, '2026-10-27T16:02')).toBeLessThan(1)
  })

  it('keeps the prayers in their order through the day', () => {
    const times = sunDay(Date.parse('2026-10-27T09:00:00Z'), MECCA).prayers.map((p) => p.at!)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('has no Fajr or ʿIshāʾ where the summer night never darkens, and no Maghrib in polar night', () => {
    const june = sunDay(Date.parse('2026-06-21T10:00:00Z'), STOCKHOLM)
    expect(june.prayers[0].at).toBeNull()
    expect(june.prayers[4].at).toBeNull()
    expect(sunDay(Date.parse('2026-12-21T10:00:00Z'), TROMSO).prayers[3].at).toBeNull()
  })
})

describe('the caption', () => {
  const day = sunDay(Date.parse('2026-10-27T10:00:00Z'), STOCKHOLM)

  it('names the next prayer', () => {
    expect(nextPrayer(Date.parse('2026-10-27T12:00:00Z'), day)).toBe('ʿAṣr')
  })

  it('turns to the next day once ʿIshāʾ has passed', () => {
    const late = Date.parse('2026-10-27T21:00:00Z')
    const shown = dayToShow(late, STOCKHOLM)
    expect(shown.noon).toBeGreaterThan(late)
    expect(nextPrayer(late, shown)).toBe('Fajr')
  })

  /** What the caption says at an instant: the prayer that comes next, and whether it is night. */
  const caption = (iso: string, place: { lat: number; lon: number }) => {
    const ms = Date.parse(iso)
    const shown = dayToShow(ms, place)
    return { next: nextPrayer(ms, shown), night: isNight(ms, shown) }
  }

  it('keeps the evening on its own day far west of Greenwich, where the UTC date has already turned', () => {
    // 16:00 and 18:00 in Los Angeles on 6 November: Maghrib, then ʿIshāʾ, are still to come today.
    expect(caption('2026-11-07T00:00:00Z', LOS_ANGELES)).toEqual({ next: 'Maghrib', night: false })
    expect(caption('2026-11-07T02:00:00Z', LOS_ANGELES)).toEqual({ next: 'ʿIshāʾ', night: true })
    // 15:00 in Honolulu: ʿAṣr has not come yet.
    expect(caption('2026-11-07T01:00:00Z', HONOLULU)).toEqual({ next: 'ʿAṣr', night: false })
    // And east of it: 06:30 in Auckland is after Fajr, so the day has begun.
    expect(caption('2026-11-05T17:30:00Z', AUCKLAND)).toEqual({ next: 'Dhuhr', night: false })
  })

  it('calls it night from Maghrib until Fajr, past midnight too', () => {
    // Stockholm, 6 November: 01:30, 13:00, 16:00 (after sunset) and 23:50.
    expect(caption('2026-11-06T00:30:00Z', STOCKHOLM)).toEqual({ next: 'Fajr', night: true })
    expect(caption('2026-11-06T12:00:00Z', STOCKHOLM)).toEqual({ next: 'ʿAṣr', night: false })
    expect(caption('2026-11-06T15:00:00Z', STOCKHOLM)).toEqual({ next: 'ʿIshāʾ', night: true })
    expect(caption('2026-11-06T22:50:00Z', STOCKHOLM)).toEqual({ next: 'Fajr', night: true })
  })

  it('ends a night that never darkens to Fajr at sunrise, and has none under the midnight sun', () => {
    // Stockholm on 21 June: 00:30 is night, 12:00 is not.
    expect(isNight(Date.parse('2026-06-20T22:30:00Z'), dayToShow(Date.parse('2026-06-20T22:30:00Z'), STOCKHOLM))).toBe(true)
    expect(isNight(Date.parse('2026-06-21T10:00:00Z'), dayToShow(Date.parse('2026-06-21T10:00:00Z'), STOCKHOLM))).toBe(false)
    // Tromsø on 21 June at 00:30: the sun is up.
    expect(isNight(Date.parse('2026-06-20T22:30:00Z'), dayToShow(Date.parse('2026-06-20T22:30:00Z'), TROMSO))).toBe(false)
  })
})
