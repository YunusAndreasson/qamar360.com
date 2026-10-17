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
 *
 * `bleed` carries the lit LIMB out past the disc by that much, leaving the terminator exactly where
 * it is, for a moon whose terminator is blurred and whose disc is then clipped: the blur softens
 * the terminator but finds lit area beyond the limb, so the limb stays crisp and fully bright.
 * Inside the disc the shape is unchanged. 0 is the plain path.
 */
export function moonPhasePath(
  cx: number,
  cy: number,
  r: number,
  illumination: number,
  waxing: boolean,
  bleed = 0,
): string {
  const rx = r * Math.abs(1 - 2 * illumination);
  // Waxing lights the right limb (outer arc sweeps right); waning mirrors to the left.
  const outerSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (illumination <= 0.5 ? 0 : 1) : illumination <= 0.5 ? 1 : 0;
  const limb = r + bleed;
  // With a bleed the limb ends below the disc, so a short drop on the centre line meets the
  // terminator where it begins; it runs outside the disc, where the clip removes it.
  const toTerminator = bleed > 0 ? ` L ${cx} ${cy + r}` : '';
  return `M ${cx} ${cy - limb} A ${limb} ${limb} 0 0 ${outerSweep} ${cx} ${cy + limb}${toTerminator} A ${rx} ${r} 0 0 ${termSweep} ${cx} ${cy - r} Z`;
}
