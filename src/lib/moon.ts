/**
 * Moon-phase geometry for the lunar-month hero.
 *
 * The Hijri month begins at the new moon, so the day of the month maps almost directly to
 * the phase: ~new on day 1, full around the 15th (laylat al-badr), waning back to new by
 * the month's end. `moonIllumination` turns a day-of-month into the lit fraction and the
 * waxing/waning direction; `moonPhasePath` draws the lit region as a true phase.
 */

/** Lit fraction (0..1) and direction for a day of the Hijri month. */
export function moonIllumination(dayOfMonth: number, monthLength: number): { illumination: number; waxing: boolean } {
  const p = monthLength > 0 ? (dayOfMonth - 1) / monthLength : 0; // 0 at the new moon, ~0.5 at the full moon
  const illumination = (1 - Math.cos(2 * Math.PI * p)) / 2;
  return { illumination, waxing: p <= 0.5 };
}

/**
 * SVG path for the *lit* portion of the moon, centred at (cx, cy) with radius r.
 * `illumination` is the lit fraction (0 = new, 0.5 = quarter, 1 = full); `waxing` lights
 * the right limb (else the left). The terminator is a true ellipse — full-width at new/full,
 * flat at the quarter — so it reads as a real phase, never a pie wedge.
 */
export function moonPhasePath(cx: number, cy: number, r: number, illumination: number, waxing: boolean): string {
  const top = cy - r;
  const bottom = cy + r;
  const rx = r * Math.abs(1 - 2 * illumination);
  // Waxing lights the right limb (outer arc sweeps right); waning mirrors to the left.
  const outerSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (illumination <= 0.5 ? 0 : 1) : illumination <= 0.5 ? 1 : 0;
  return `M ${cx} ${top} A ${r} ${r} 0 0 ${outerSweep} ${cx} ${bottom} A ${rx} ${r} 0 0 ${termSweep} ${cx} ${top} Z`;
}

/**
 * The direction of the sun as seen from the moon's centre, for lighting the moon as a sphere:
 * x to the right, y down, z toward the viewer. The same phase {@link moonPhasePath} draws — at
 * new moon the sun is straight behind (0, 0, −1), at full straight behind the viewer (0, 0, 1),
 * and at the quarters off to the lit side — so a lit sphere and the flat path agree on how much
 * of the disc is day.
 */
export function sunDirection(illumination: number, waxing: boolean): [number, number, number] {
  const z = 2 * illumination - 1; // −1 at new, 0 at the quarters, 1 at full
  const x = Math.sqrt(Math.max(0, 1 - z * z));
  return [waxing ? x : -x, 0, z];
}
