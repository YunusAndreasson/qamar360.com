import { describe, expect, it } from 'vitest'

import { eveningPhase, type HijriDate, hijriDate, moonIllumination, nextMonth, sunDirection } from '../moon'

describe('moonIllumination', () => {
  it('is new on the 1st, full mid-month and waning after', () => {
    expect(moonIllumination(1, 30).illumination).toBeCloseTo(0)
    expect(moonIllumination(16, 30)).toEqual({ illumination: 1, waxing: true })
    expect(moonIllumination(24, 30).waxing).toBe(false)
  })

  it('sweeps smoothly between days', () => {
    const a = moonIllumination(8, 30).illumination
    const b = moonIllumination(8.5, 30).illumination
    expect(b).toBeGreaterThan(a)
  })
})

describe('sunDirection', () => {
  it('lights the right limb while waxing and faces the viewer at full', () => {
    const [x, , z] = sunDirection(0.5, true)
    expect(x).toBeCloseTo(1)
    expect(z).toBeCloseTo(0)
    expect(sunDirection(1, true)[2]).toBe(1)
    expect(sunDirection(0.5, false)[0]).toBeCloseTo(-1)
  })
})

describe('hijriDate', () => {
  it('names the Umm al-Qura month and measures it', () => {
    // 1 Ramaḍān 1447 is 18 February 2026 in Umm al-Qura; Ramaḍān 1447 has 29 days.
    const first = hijriDate(new Date('2026-02-18T12:00:00Z'))
    expect(first).toMatchObject({ day: 1, month: 9, year: 1447, monthName: 'Ramaḍān' })
    expect([29, 30]).toContain(first?.monthLength)
  })
})

describe('eveningPhase', () => {
  it('shows a visible waxing crescent on the 1st and comes round to the next one after the month', () => {
    const first = eveningPhase(1, 30)
    expect(first.waxing).toBe(true)
    // Wide enough to read as a crescent, not a hairline on a dark disc.
    expect(first.illumination).toBeGreaterThan(0.03)
    expect(first.illumination).toBeLessThan(0.05)
    expect(eveningPhase(31, 30).illumination).toBeCloseTo(first.illumination)
  })
})

describe('nextMonth', () => {
  const on = (day: number, month: number, monthLength: number): HijriDate => ({
    day,
    month,
    year: 1448,
    monthName: '',
    monthLength,
  })

  it('counts the days to the next 1st in a 29- and a 30-day month', () => {
    expect(nextMonth(on(16, 5, 29))).toEqual({ name: 'Jumādā al-Thānī', days: 14 })
    expect(nextMonth(on(16, 5, 30))).toEqual({ name: 'Jumādā al-Thānī', days: 15 })
    expect(nextMonth(on(30, 8, 30))).toEqual({ name: 'Ramaḍān', days: 1 })
  })

  it('turns the year after Dhū al-Ḥijjah', () => {
    expect(nextMonth(on(1, 12, 29)).name).toBe('Muḥarram')
  })
})
