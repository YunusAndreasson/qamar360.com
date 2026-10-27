/**
 * The scroll behind the page's two played sections, the day (`day-play.tsx`) and the month
 * (`month-orbit.tsx`). Each is a tall section with a pinned stage: the scroll runs through a list
 * of stops, holds on each so its words can be read, and eases between them.
 */
export type Play = {
  /** Where the played thing stands, 0–1, between the first stop's place and the last's. */
  t: number
  /** The stop on the stage: the one held, or the nearer of the two in a run. */
  stop: number
  /** How far through its hold that stop is, 0–1: 1 once the run to the next one has begun. */
  held: number
  /** The stop whose share of the scroll this is: the one held, or the one a run leaves. */
  from: number
  /** How far the run from `from` to the next stop has gone, eased, 0–1: 0 while it is held. */
  run: number
}

/**
 * Scroll position (0–1) to the place it plays. Each stop takes a share of the scroll by its
 * `weight` (1 by default); `hold` of that share stands still on the stop and the rest eases to the
 * next. The last stop's whole share is its hold, so the section ends at rest.
 */
export function playAt(scroll: number, places: readonly number[], hold: number, weights?: readonly number[]): Play {
  const n = places.length
  const w = places.map((_, i) => weights?.[i] ?? 1)
  const total = w.reduce((a, b) => a + b, 0)
  let at = Math.min(0.99999, Math.max(0, scroll)) * total
  let i = 0
  while (i < n - 1 && at >= w[i]) at -= w[i++]
  const local = at / w[i]
  if (i === n - 1) return { t: places[i], stop: i, held: local, from: i, run: 0 }
  if (local <= hold) return { t: places[i], stop: i, held: local / hold, from: i, run: 0 }
  const k = (local - hold) / (1 - hold)
  const eased = k * k * (3 - 2 * k)
  return {
    t: places[i] + (places[i + 1] - places[i]) * eased,
    stop: eased < 0.5 ? i : i + 1,
    held: eased < 0.5 ? 1 : 0,
    from: i,
    run: eased,
  }
}

/**
 * How far a played section's stage has arrived, 0–1, from where the section's top is on the screen.
 * The stage stays hidden until the section's top has climbed past the middle of the screen, then
 * fades in by the time it nears the top, so it never shows half-made under the words before it.
 */
export function arrival(top: number, viewport: number): number {
  const k = Math.min(1, Math.max(0, (0.5 - top / viewport) / 0.45))
  return k * k * (3 - 2 * k)
}

/**
 * The mirror of `arrival`: how much of a played section's stage is still there, 0–1, from where
 * the section's bottom is on the screen. Whole while the stage is pinned (the bottom is at or below
 * the screen's foot), it dissolves into the night as the stage scrolls away, gone once the bottom
 * has climbed to the middle of the screen.
 */
export function departure(bottom: number, viewport: number): number {
  const k = Math.min(1, Math.max(0, (bottom / viewport - 0.5) / 0.45))
  return k * k * (3 - 2 * k)
}

const smooth = (from: number, to: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return k * k * (3 - 2 * k)
}

/**
 * The page is one night, Maghrib at the top and Fajr at the foot. From how far down the page the
 * visitor is (0–1): the dusk's last light low on the screen, gone once the opening has been read;
 * the dawn's first light rising over the last screens; and the stars, which fade a little as the
 * dawn comes, as they do before Fajr.
 */
export function nightLight(progress: number): { dusk: number; dawn: number; stars: number } {
  const dusk = 1 - smooth(0.015, 0.09, progress)
  const dawn = smooth(0.86, 0.99, progress)
  return { dusk, dawn, stars: 1 - 0.35 * dawn }
}
