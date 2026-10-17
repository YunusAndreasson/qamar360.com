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

/**
 * `from` moved `t` of the way to `to` (0 = `from`, 1 = `to`), both `#RRGGBB`. For a colour that
 * must sit between two theme colours and still be OPAQUE: a translucent stroke over its own round
 * cap shows a seam where the two overlap.
 */
export function mixHex(from: string, to: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
