/**
 * Islamic geometric ornament — pure compass math.
 *
 * Every motif in the app's decoration is constructed the way Islamic geometry always was:
 * from the circle, with a compass. These helpers return plain coordinates / SVG path data so
 * the ornament components stay purely presentational (the same split as {@link moon.ts}).
 *
 *  - `flowerOfLife`  — overlapping circles on a triangular lattice (the quiet "texture" motif).
 *  - `octagramStar`  — an eight-point star as a single polygon path (the focal-halo motif).
 */

/** A construction circle plus `w`: its luminosity weight in [EDGE_GLOW, 1] — 1 at the
 *  lattice heart, easing to EDGE_GLOW at the rim (see {@link flowerOfLife}). */
export type GCircle = { cx: number; cy: number; r: number; w: number };

const round = (n: number) => Math.round(n * 100) / 100;

/** Luminosity floor for the outermost circles — the lattice recedes but never fully vanishes,
 *  so the field still reads as a continuous ground, not just a lone central flower. */
const EDGE_GLOW = 0.3;

/**
 * Flower-of-life lattice: a centre circle of radius `r` with circles tiled on the triangular
 * lattice spaced one radius apart (so neighbours pass through each other's centres — the
 * classic vesica-petal field). `rings` is the hex radius: 1 → the 7-circle seed of life,
 * 2 → 19 circles. Returns the circle centres clipped to a hexagon of that radius.
 *
 * Each circle also carries a luminosity weight `w`: the field is brightest at the `focal`
 * point — by default the lattice heart (the seed-of-life rosette) — and eases outward to
 * {@link EDGE_GLOW}. This is the figure/ground reading of classical Islamic geometry (faint
 * construction circles, a legible figure) and, on theme, light blooming from one point. A
 * caller can shift `focal` off-centre — e.g. to the right, so a left-aligned card's text sits
 * over the faded side. The caller multiplies its base stroke opacity by `w`, so the motif
 * gains depth instead of reading as a flat field. Euclidean distance keeps the falloff smooth.
 */
export function flowerOfLife(
  cx: number,
  cy: number,
  r: number,
  rings: number,
  focal?: { x: number; y: number },
): GCircle[] {
  // Triangular-lattice basis: e1 along x, e2 at 60°. Spacing = r.
  const e2x = r / 2;
  const e2y = (r * Math.sqrt(3)) / 2;
  const fx = focal?.x ?? cx;
  const fy = focal?.y ?? cy;

  const points: { x: number; y: number }[] = [];
  for (let i = -rings; i <= rings; i++) {
    for (let j = -rings; j <= rings; j++) {
      // Hex (axial) distance from the centre — keeps the field a clean hexagon, not a square.
      const hexDist = (Math.abs(i) + Math.abs(j) + Math.abs(i + j)) / 2;
      if (hexDist > rings) continue;
      points.push({ x: cx + i * r + j * e2x, y: cy + j * e2y });
    }
  }
  // Normalise by the farthest circle from the focal, so `w` always eases from 1 (at the focal)
  // to EDGE_GLOW at the rim — wherever the focal sits.
  const maxDist = Math.max(1, ...points.map((p) => Math.hypot(p.x - fx, p.y - fy)));
  return points.map((p) => {
    const t = Math.min(1, Math.hypot(p.x - fx, p.y - fy) / maxDist);
    const ease = (1 + Math.cos(Math.PI * t)) / 2; // raised-cosine: 1 at focal → 0 at rim
    return { cx: round(p.x), cy: round(p.y), r: round(r), w: round(EDGE_GLOW + (1 - EDGE_GLOW) * ease) };
  });
}

/**
 * An eight-point star as one polygon: 16 vertices alternating between `rOuter` (the points)
 * and `rInner` (the valleys), starting at the top. Used for the focal moon-halo motif.
 */
export function octagramStar(cx: number, cy: number, rOuter: number, rInner: number): string {
  const points: string[] = [];
  for (let k = 0; k < 16; k++) {
    const r = k % 2 === 0 ? rOuter : rInner;
    const a = ((k * 22.5 - 90) * Math.PI) / 180; // start at 12 o'clock
    points.push(`${round(cx + r * Math.cos(a))} ${round(cy + r * Math.sin(a))}`);
  }
  return `M ${points.join(' L ')} Z`;
}
