/**
 * Plot geometry and series math, shared by every line chart in the app — the Progress screen's
 * "Over time" card and the per-habit Stats trend. Both drew the same line the same way from two
 * copies of these functions; they live here once so the two charts can never disagree about where
 * a point sits or how long a path is.
 *
 * Pure — no React, no SVG, no theme. Directly unit-testable, like `@/lib/progress`.
 */

import { clamp01 } from '@/lib/progress';

export type Pt = { x: number; y: number };

/** A plot's fixed geometry: its height and the insets the line is drawn within. */
export type PlotBox = {
  /** Plot height in points. */
  height: number;
  /** Vertical inset — keeps a 360° point off the top edge and a 0° point off the baseline. */
  padY: number;
  /**
   * The inset below the baseline, when it should differ from `padY`. Defaults to `padY`, which is
   * the right answer for a chart carrying axis labels under its floor — but a chart that draws
   * nothing below the baseline is reserving that strip for no one, and the empty band shows as
   * slack at the foot of its card. Set it small there and keep `padY` for the headroom a full
   * orbit needs at the top.
   */
  padBottom?: number;
  /** Horizontal inset — at minimum half an axis label, so edge labels stay centred on their dot. */
  padX: number;
};

/**
 * Where a point sits, given its position along the series (`span`, 0–1 from first slot to last)
 * and its value (`fraction`, 0–1 bottom to top). Taking a normalized span rather than an
 * index/count pair lets a series place points on an axis wider than itself — the daily chart
 * reserves room to the right of today for where it is heading.
 */
export function pointAt(span: number, fraction: number, width: number, box: PlotBox): Pt {
  const x = box.padX + (width - 2 * box.padX) * span;
  const y = box.padY + (1 - clamp01(fraction)) * (box.height - box.padY - (box.padBottom ?? box.padY));
  return { x, y };
}

/** Evenly-spaced span for slot `index` of `count`. A lone slot is centred — pinned to the left
 *  edge it reads as a chart that failed to draw rather than as a record one entry long. */
export function spanFor(index: number, count: number): number {
  'worklet';
  return count > 1 ? index / (count - 1) : 0.5;
}

/**
 * The x a slot is drawn at — {@link pointAt}'s horizontal half, on its own so a scrub cursor can be
 * placed from a worklet without the value math (and its `clamp01`) coming along for the ride.
 */
export function slotX(index: number, total: number, width: number, box: PlotBox): number {
  'worklet';
  return box.padX + (width - 2 * box.padX) * spanFor(index, total);
}

/**
 * Which slot an x falls on — the exact inverse of {@link slotX}, clamped into the series.
 *
 * Solved from the same geometry rather than re-derived, because a scrub that computes its position
 * a second way is a scrub that can disagree with the curve it is reading. The round trip is pinned
 * by a test for exactly that reason.
 */
export function slotAtX(x: number, total: number, width: number, box: PlotBox): number {
  'worklet';
  if (total <= 1) return 0;
  const inner = width - 2 * box.padX;
  if (inner <= 0) return 0;
  const i = Math.round(((x - box.padX) / inner) * (total - 1));
  return i < 0 ? 0 : i > total - 1 ? total - 1 : i;
}

/**
 * The drawn length of a polyline — the `strokeDasharray`/`strokeDashoffset` budget that makes a
 * path draw itself on. Measured, not estimated: an offset larger than the true length leaves a
 * visible stub, a smaller one snaps the tail in.
 */
export function polylineLength(points: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/**
 * The `d` attributes for a series: the line itself, and the area between it and the baseline.
 * Both are empty strings below two points — a one-point "line" is a dot, and a one-point area is a
 * degenerate sliver that renders as a hairline artefact.
 */
export function buildPaths(points: readonly Pt[], baselineY: number): { line: string; area: string } {
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length < 2 || !first || !last) return { line: '', area: '' };
  const spine = points.map((p) => `${p.x} ${p.y}`).join(' L ');
  return {
    line: `M ${spine}`,
    area: `M ${first.x} ${baselineY} L ${spine} L ${last.x} ${baselineY} Z`,
  };
}

/**
 * Tangent at each point for a **monotone** cubic through them (Fritsch–Carlson, 1980).
 *
 * The guarantee is the reason this is not a plain Catmull–Rom or cardinal spline: those overshoot
 * around a peak, and here a peak is a period fully kept. An overshoot would bulge the curve above a
 * complete orbit and below an empty one — drawing rates this app defines as impossible, and doing it
 * exactly where the eye is drawn. Fritsch–Carlson clips the tangents into the region where the
 * cubic cannot leave the interval its endpoints span, so the curve is smooth *and* stays honest: it
 * only rises where the data rises, and it never exceeds a value it was given.
 */
function monotoneTangents(pts: readonly Pt[]): number[] {
  const n = pts.length;
  const secant: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    secant.push(dx === 0 ? 0 : (pts[i + 1]!.y - pts[i]!.y) / dx);
  }
  // Endpoints take their one neighbouring secant; interior points the average of both.
  const m: number[] = [secant[0] ?? 0];
  for (let i = 1; i < n - 1; i++) m.push((secant[i - 1]! + secant[i]!) / 2);
  m.push(secant[n - 2] ?? 0);

  for (let i = 0; i < n - 1; i++) {
    // A flat run must stay flat: any tangent through a plateau would arc off it and come back.
    if (secant[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / secant[i]!;
    const b = m[i + 1]! / secant[i]!;
    const h = a * a + b * b;
    // Outside the circle of radius 3 the cubic can leave the interval — pull the pair back onto it.
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * secant[i]!;
      m[i + 1] = t * b * secant[i]!;
    }
  }
  return m;
}

/**
 * The same two paths {@link buildPaths} returns, drawn as a smooth monotone curve instead of
 * straight segments between the points.
 *
 * A polyline through daily readings reads as a saw — the eye follows the corners rather than the
 * shape, and a rhythm that is genuinely steady looks agitated. The curve is what makes the line
 * legible as a *trend*; that it cannot overshoot is what keeps it honest while doing so.
 */
export function buildSmoothPaths(points: readonly Pt[], baselineY: number): { line: string; area: string } {
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length < 2 || !first || !last) return { line: '', area: '' };

  const m = monotoneTangents(points);
  let spine = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    // Control points a third of the span along each tangent — the Hermite-to-Bézier conversion.
    const third = (q.x - p.x) / 3;
    spine += ` C ${p.x + third} ${p.y + m[i]! * third}, ${q.x - third} ${q.y - m[i + 1]! * third}, ${q.x} ${q.y}`;
  }
  return {
    line: `M ${first.x} ${first.y}${spine}`,
    area: `M ${first.x} ${baselineY} L ${first.x} ${first.y}${spine} L ${last.x} ${baselineY} Z`,
  };
}

/**
 * The touch column for slot `index`: bounds at the midpoints between adjacent slot x-positions,
 * with the edge columns running out to the plot's edge. NOT `width / count` — the slots are inset
 * by `padX`, so equal-width columns would drift off their points at both ends.
 */
export function columnBounds(
  index: number,
  count: number,
  width: number,
  box: PlotBox,
): { left: number; width: number } {
  const step = count > 1 ? (width - 2 * box.padX) / (count - 1) : width;
  const { x } = pointAt(spanFor(index, count), 0, width, box);
  const left = index === 0 ? 0 : x - step / 2;
  const right = index === count - 1 ? width : x + step / 2;
  return { left, width: Math.max(0, right - left) };
}


/**
 * The plain average of `values` — the chart's one horizontal reference.
 *
 * `null` below two points, for the same reason {@link linearFit} is: the average of a single
 * reading is that reading, and a rule drawn through the only point you have says nothing about it.
 */
export function mean(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

/**
 * Least-squares fit of `values` against their indices — `slope` per step, `intercept` at index 0.
 * `null` below two points: one point has no direction, and pretending otherwise is the whole
 * failure mode a projection has to avoid.
 */
export function linearFit(values: readonly number[]): { slope: number; intercept: number } | null {
  const n = values.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  let meanY = 0;
  for (const v of values) meanY += v;
  meanY /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (values[i]! - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: meanY - slope * meanX };
}

/** The reading a projection carries: where it goes, and the one word for which way that is. */
export type Projection = {
  /** Projected rates for steps 1…horizon past the last fitted point, each clamped to 0–1. */
  values: number[];
  /** Change per week of steps — the number the direction word is read off. */
  weeklySlope: number;
  direction: 'Rising' | 'Steady' | 'Easing';
};

/**
 * A weekly change smaller than this is noise, not a direction — ~11° of orbit over seven steps.
 * Below it the projection reads "Steady" and its line runs flat, rather than dramatising a wobble.
 */
export const DIRECTION_THRESHOLD = 0.03;

/**
 * Where a series is heading: a straight fit over its last `fitWindow` points, continued `horizon`
 * steps past the end.
 *
 * Fitted over the tail only, so an old habit of a different shape doesn't hold the projection
 * back. Every value is clamped to 0–1 — an extrapolation is a straight line and would otherwise
 * run off the plot within a few steps, which reads as a promise rather than a direction.
 *
 * `null` below two points. The word is deliberately three-valued and gentle at the bottom:
 * "Easing", not a failure — the app states direction, it does not keep score against you.
 */
export function project(
  values: readonly number[],
  { horizon, fitWindow }: { horizon: number; fitWindow: number },
): Projection | null {
  const tail = values.slice(Math.max(0, values.length - fitWindow));
  const fit = linearFit(tail);
  if (!fit) return null;
  const lastIndex = tail.length - 1;
  const projected: number[] = [];
  for (let step = 1; step <= horizon; step++) {
    projected.push(clamp01(fit.intercept + fit.slope * (lastIndex + step)));
  }
  const weeklySlope = fit.slope * 7;
  return {
    values: projected,
    weeklySlope,
    direction:
      weeklySlope > DIRECTION_THRESHOLD ? 'Rising' : weeklySlope < -DIRECTION_THRESHOLD ? 'Easing' : 'Steady',
  };
}
