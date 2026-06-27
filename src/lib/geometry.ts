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

export type GCircle = { cx: number; cy: number; r: number };

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Flower-of-life lattice: a centre circle of radius `r` with circles tiled on the triangular
 * lattice spaced one radius apart (so neighbours pass through each other's centres — the
 * classic vesica-petal field). `rings` is the hex radius: 1 → the 7-circle seed of life,
 * 2 → 19 circles. Returns the circle centres clipped to a hexagon of that radius.
 */
export function flowerOfLife(cx: number, cy: number, r: number, rings: number): GCircle[] {
  const circles: GCircle[] = [];
  // Triangular-lattice basis: e1 along x, e2 at 60°. Spacing = r.
  const e2x = r / 2;
  const e2y = (r * Math.sqrt(3)) / 2;
  for (let i = -rings; i <= rings; i++) {
    for (let j = -rings; j <= rings; j++) {
      // Hex (axial) distance from the centre — keeps the field a clean hexagon, not a square.
      const hexDist = (Math.abs(i) + Math.abs(j) + Math.abs(i + j)) / 2;
      if (hexDist > rings) continue;
      circles.push({ cx: round(cx + i * r + j * e2x), cy: round(cy + j * e2y), r: round(r) });
    }
  }
  return circles;
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
