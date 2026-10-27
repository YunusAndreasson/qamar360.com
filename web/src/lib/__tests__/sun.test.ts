import { describe, expect, it } from 'vitest'

import { dayToShow, nextPrayer, sunDay } from '../sun'

const STOCKHOLM = { lat: 59.333, lon: 18.05 }
const MECCA = { lat: 21.42, lon: 39.83 }
const TROMSO = { lat: 69.65, lon: 18.96 }

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
})
