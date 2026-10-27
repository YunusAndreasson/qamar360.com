import { describe, expect, it } from 'vitest'

import { buildStars, MIN_DIST, STAR_COUNT, TILE, tileDistance } from '../stars'

describe('buildStars', () => {
  const stars = buildStars()

  it('draws the same sky every time', () => {
    expect(buildStars()).toEqual(stars)
  })

  it('places every star it was asked for, inside the tile', () => {
    expect(stars).toHaveLength(STAR_COUNT)
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThan(TILE)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThan(TILE)
    }
  })

  it('keeps every two stars at least the floor apart, across the wrap too', () => {
    let nearest = Infinity
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        nearest = Math.min(nearest, tileDistance(stars[i].x, stars[i].y, stars[j].x, stars[j].y))
      }
    }
    expect(nearest).toBeGreaterThanOrEqual(MIN_DIST)
  })

  it('follows the pyramid: few bright, many faint', () => {
    const share = (tier: string) => stars.filter((s) => s.tier === tier).length / stars.length
    expect(share('bright')).toBeGreaterThan(0.01)
    expect(share('bright')).toBeLessThan(0.06)
    expect(share('faint')).toBeGreaterThan(0.68)
    expect(share('faint')).toBeLessThan(0.82)
  })

  it('warms and steadies only the bright anchors', () => {
    for (const s of stars) {
      if (s.tier === 'bright') expect(s.period).toBe(0)
      else {
        expect(s.warm).toBe(false)
        expect(s.period).toBeGreaterThan(0)
      }
    }
  })
})
