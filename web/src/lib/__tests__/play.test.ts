import { describe, expect, it } from 'vitest'

import { arrival, departure, nightLight, playAt } from '../play'

const PLACES = [0, 0.5, 1]

describe('playAt', () => {
  it('holds on each stop before it moves', () => {
    expect(playAt(0, PLACES, 0.4)).toEqual({ t: 0, stop: 0, held: 0, from: 0, run: 0 })
    const mid = playAt(0.2 / 3, PLACES, 0.4)
    expect(mid.t).toBe(0)
    expect(mid.held).toBeCloseTo(0.5)
  })

  it('eases between stops and hands the stage over halfway', () => {
    const before = playAt(0.69 / 3, PLACES, 0.4)
    const after = playAt(0.71 / 3, PLACES, 0.4)
    expect(before.stop).toBe(0)
    expect(after.stop).toBe(1)
    expect(after.held).toBe(0)
    expect(before.t).toBeGreaterThan(0)
    expect(after.t).toBeLessThan(0.5)
    // Both halves of the run belong to the stop it leaves.
    expect(before).toMatchObject({ from: 0 })
    expect(after).toMatchObject({ from: 0 })
    expect(after.run).toBeGreaterThan(before.run)
  })

  it('rests on the last stop for its whole share, and clamps the ends', () => {
    expect(playAt(0.9, PLACES, 0.4)).toMatchObject({ t: 1, stop: 2 })
    expect(playAt(0.9, PLACES, 0.4).held).toBeCloseTo(0.7)
    expect(playAt(2, PLACES, 0.4).t).toBe(1)
    expect(playAt(-1, PLACES, 0.4)).toEqual({ t: 0, stop: 0, held: 0, from: 0, run: 0 })
  })

  it('gives each stop its weight of the scroll', () => {
    // Weights 2 : 1 : 1, so the first stop's share is half the scroll.
    expect(playAt(0.19, PLACES, 0.4, [2, 1, 1])).toMatchObject({ t: 0, stop: 0 })
    expect(playAt(0.51, PLACES, 0.4, [2, 1, 1])).toMatchObject({ t: 0.5, stop: 1 })
  })
})

describe('arrival', () => {
  it('stays hidden until the section passes mid-screen, then is whole near the top', () => {
    expect(arrival(900, 900)).toBe(0)
    expect(arrival(450, 900)).toBe(0)
    expect(arrival(45, 900)).toBe(1)
    expect(arrival(-200, 900)).toBe(1)
    expect(arrival(250, 900)).toBeGreaterThan(0)
    expect(arrival(250, 900)).toBeLessThan(1)
  })
})

describe('departure', () => {
  it('stays whole while the stage is pinned, then is gone by mid-screen', () => {
    expect(departure(1200, 900)).toBe(1)
    expect(departure(900, 900)).toBe(1)
    expect(departure(450, 900)).toBe(0)
    expect(departure(-100, 900)).toBe(0)
    expect(departure(650, 900)).toBeGreaterThan(0)
    expect(departure(650, 900)).toBeLessThan(1)
  })
})

describe('nightLight', () => {
  it('opens on dusk, keeps plain night between, and ends at dawn with fainter stars', () => {
    expect(nightLight(0)).toEqual({ dusk: 1, dawn: 0, stars: 1 })
    expect(nightLight(0.5)).toEqual({ dusk: 0, dawn: 0, stars: 1 })
    const end = nightLight(1)
    expect(end.dusk).toBe(0)
    expect(end.dawn).toBe(1)
    expect(end.stars).toBeCloseTo(0.65)
  })

  it('never jumps: each light moves one way through its own zone', () => {
    let last = nightLight(0)
    for (let i = 1; i <= 200; i++) {
      const now = nightLight(i / 200)
      expect(now.dusk).toBeLessThanOrEqual(last.dusk)
      expect(now.dawn).toBeGreaterThanOrEqual(last.dawn)
      // A smoothstep over 13% of the page: half a percent of scroll moves it under 6%.
      expect(Math.abs(now.dawn - last.dawn)).toBeLessThan(0.06)
      last = now
    }
  })
})
