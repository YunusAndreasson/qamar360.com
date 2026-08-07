/**
 * Plot geometry and series math, shared by every line chart in the app — the Progress screen's
 * "Over time" card and the per-habit Insights trend. Both drew the same line the same way from two
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
  const y = box.padY + (1 - clamp01(fraction)) * (box.height - 2 * box.padY);
  return { x, y };
}

/** Evenly-spaced span for slot `index` of `count`. A lone slot is centred — pinned to the left
 *  edge it reads as a chart that failed to draw rather than as a record one entry long. */
export function spanFor(index: number, count: number): number {
  return count > 1 ? index / (count - 1) : 0.5;
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
 * A trailing mean over `window` samples, ending at each point — the raw signal smoothed just
 * enough to read as a direction rather than a zig-zag.
 *
 * The window is the caller's `min(window, i + 1)`: an early sample averages only what exists, so a
 * second day of use already produces a real two-point line instead of waiting a week for the
 * window to fill. It grows into the full window with the record, with no cliff where the meaning
 * of the line suddenly changes.
 */
export function trailingMean(values: readonly number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    // Each window is summed from scratch rather than carried as a running total. A rolling sum
    // accumulates float error as terms are added and subtracted back out, so `window: 1` — which
    // must be the identity for series that are already aggregated — drifted off its own input.
    const from = Math.max(0, i - window + 1);
    let sum = 0;
    for (let k = from; k <= i; k++) sum += values[k]!;
    out.push(sum / (i - from + 1));
  }
  return out;
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
