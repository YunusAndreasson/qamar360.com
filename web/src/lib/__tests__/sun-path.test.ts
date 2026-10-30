import { describe, expect, it } from 'vitest'

import { altitude, PRAYERS, skyAt } from '../../components/sun-path'

const at = (name: string) => PRAYERS.find((p) => p.name === name)!.t

describe('skyAt', () => {
  it('stays in the range the washes take as an opacity', () => {
    for (let t = 4; t <= 20; t += 0.1) {
      for (const share of Object.values(skyAt(t))) {
        expect(share).toBeGreaterThanOrEqual(0)
        expect(share).toBeLessThanOrEqual(1)
      }
    }
  })

  it('has first light and nothing else at Fajr', () => {
    expect(skyAt(at('Fajr'))).toEqual({ day: 0, low: 0, first: 1 })
  })

  it('lights the sky at its fullest when the sun is highest', () => {
    const noon = skyAt(12)
    expect(noon.day).toBe(1)
    expect(noon.low).toBe(0)
    expect(noon.first).toBe(0)
    expect(skyAt(at('Dhuhr')).day).toBeGreaterThan(0.99)
  })

  it('warms as the sun nears the horizon, and most of all as it sets', () => {
    const sunset = skyAt(at('Maghrib'))
    expect(skyAt(at('ʿAṣr')).day).toBeGreaterThan(sunset.day)
    expect(sunset.day).toBeCloseTo(0)
    expect(sunset.low).toBeCloseTo(1)
    expect(sunset.first).toBe(0)
    expect(skyAt(6).low).toBeLessThan(skyAt(18).low)
  })

  it('leaves no light at all at ʿIshāʾ: the twilight has gone', () => {
    expect(altitude(at('ʿIshāʾ'))).toBeLessThan(-17)
    expect(skyAt(at('ʿIshāʾ'))).toEqual({ day: 0, low: 0, first: 0 })
  })
})
