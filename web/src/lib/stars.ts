/**
 * The stars behind the site, as plain data: what `components/starfield.tsx` draws.
 *
 * The look is the app's (`src/lib/starfield.ts` at the repo root). A fixed seed draws the same
 * sky on every visit, the placement is blue noise so there are no clumps and no voids, and the
 * brightness follows the real sky's pyramid: a few bright anchors over many faint stars. Only
 * the bright ones are ever warm, and they never twinkle.
 *
 * The stars fill one square tile that repeats in both directions, so the field can drift and
 * scroll forever without an edge. Each star sits at a depth: the far ones move least.
 */

/** The app's `SKY_SEED`: one sky, forever. */
export const SKY_SEED = 20260101

/** The tile's side in CSS pixels. Wider than a phone, so the repeat is never seen there. */
export const TILE = 1200

/** About one star per 2,500 square CSS pixels. */
export const STAR_COUNT = Math.round((TILE * TILE) / 2500)

/** The blue-noise floor between two stars, in CSS pixels. */
export const MIN_DIST = 26

export type StarTier = 'bright' | 'mid' | 'faint'

export type Star = {
  x: number
  y: number
  /** Diameter in CSS pixels. */
  size: number
  /** Peak opacity. */
  alpha: number
  tier: StarTier
  /** 0 far, 1 middle, 2 near. */
  depth: 0 | 1 | 2
  warm: boolean
  /** Seconds per breath; 0 for a bright anchor, which holds still. */
  period: number
  /** Where in its breath the star starts, in radians. */
  phase: number
}

/** The sky's pyramid. */
export const TIERS: Record<StarTier, { share: number; size: [number, number]; alpha: [number, number] }> = {
  bright: { share: 0.03, size: [1.4, 1.6], alpha: [0.48, 0.62] },
  mid: { share: 0.22, size: [1, 1.3], alpha: [0.28, 0.4] },
  faint: { share: 0.75, size: [0.7, 1], alpha: [0.1, 0.24] },
}

/** mulberry32: small, fast, and the same sequence for the same seed in every engine. */
export function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (r: () => number, [lo, hi]: [number, number]) => lo + r() * (hi - lo)

/** The distance between two points on the tile, which wraps at its edges. */
export function tileDistance(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.abs(ax - bx)
  const dy = Math.abs(ay - by)
  return Math.hypot(Math.min(dx, TILE - dx), Math.min(dy, TILE - dy))
}

export function buildStars(seed = SKY_SEED, count = STAR_COUNT): Star[] {
  const r = random(seed)

  // Dart throwing on a grid of cells one floor wide: a new star only has to look at the 25 cells
  // round its own.
  const cells = Math.floor(TILE / MIN_DIST)
  const cell = TILE / cells
  const grid: number[][] = Array.from({ length: cells * cells }, () => [])
  const points: [number, number][] = []
  const fits = (x: number, y: number) => {
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const k = ((cy + j + cells) % cells) * cells + ((cx + i + cells) % cells)
        for (const p of grid[k]) {
          if (tileDistance(x, y, points[p][0], points[p][1]) < MIN_DIST) return false
        }
      }
    }
    return true
  }
  for (let tries = 0; points.length < count && tries < count * 60; tries++) {
    const x = r() * TILE
    const y = r() * TILE
    if (!fits(x, y)) continue
    grid[Math.floor(y / cell) * cells + Math.floor(x / cell)].push(points.length)
    points.push([x, y])
  }

  return points.map(([x, y]) => {
    const roll = r()
    const tier: StarTier = roll < TIERS.bright.share ? 'bright' : roll < TIERS.bright.share + TIERS.mid.share ? 'mid' : 'faint'
    const { size, alpha } = TIERS[tier]
    // A brighter star reads as a nearer one, so the bright ones sit near and most faint ones far.
    const d = r()
    const depth = (tier === 'bright' ? 2 : tier === 'mid' ? (d < 0.5 ? 1 : 2) : d < 0.65 ? 0 : 1) as 0 | 1 | 2
    return {
      x,
      y,
      size: between(r, size),
      alpha: between(r, alpha),
      tier,
      depth,
      warm: tier === 'bright' && r() < 1 / 3,
      period: tier === 'bright' ? 0 : between(r, [5, 11]),
      phase: r() * Math.PI * 2,
    }
  })
}
