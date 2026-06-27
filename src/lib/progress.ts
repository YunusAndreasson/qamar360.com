/**
 * Progress math, shared by every chart. Completion in this app is shown around a lunar orbit,
 * so a rate (0–1) is expressed in orbit *degrees*, never percent — see the Progress screen.
 * Kept here so the moon ring, the month bars and the year/week strips compute it identically.
 */

/** A full orbit — 100% completion. */
const FULL_CIRCLE_DEGREES = 360;

/** Clamp a value into the 0–1 completion range. */
export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** A completion rate (0–1) as whole orbit degrees — the app's unit for progress. */
export function toDegrees(rate: number): number {
  return Math.round(clamp01(rate) * FULL_CIRCLE_DEGREES);
}
