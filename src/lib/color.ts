/**
 * A `#RRGGBB` colour at an alpha, as `#RRGGBBAA`.
 *
 * For gradient stops that fade a colour out. Fading to `transparent` instead fades toward
 * transparent BLACK, and the stops in between pick up a grey cast on the way.
 */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex.slice(0, 7)}${a.toString(16).padStart(2, '0')}`;
}
