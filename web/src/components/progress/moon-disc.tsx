import { moonIllumination, moonPhasePath } from '#/lib/moon'
import { cn } from '#/lib/utils'

/**
 * Shared SVG gradient defs for every moon on the page. Rendered once (referenced by id from each
 * MoonDisc) so the body-shading and moonlight gradients aren't duplicated per cell. Safe to mount
 * more than once — identical ids resolve to the first in document order.
 */
export function MoonGradients() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        {/* The unlit sphere, shaded off the neutral chart ramp down to the card it sits on.
            NOT --secondary/--muted/--accent: in zinc all three are the same oklch value, so a
            gradient built from them is flat however many stops it declares. */}
        <radialGradient id="moon-body" cx="34%" cy="30%" r="80%">
          <stop offset="0%" stopColor="var(--chart-4)" />
          <stop offset="55%" stopColor="var(--chart-5)" />
          <stop offset="100%" stopColor="var(--card)" />
        </radialGradient>
        {/* Moonlight. One hue, shaded — a flat fill at this size reads as a sticker, not a sphere,
            so the ramp runs from the accent down the neutral scale rather than glowing. */}
        <radialGradient id="moon-light" cx="38%" cy="34%" r="86%">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="55%" stopColor="var(--chart-1)" />
          <stop offset="100%" stopColor="var(--chart-2)" />
        </radialGradient>
      </defs>
    </svg>
  )
}

/**
 * A moon at its true phase for `dayOfMonth`. The unlit body is a shaded sphere; the lit region uses
 * the moonlight gradient at `litOpacity` (how complete that day was), with a faint rim so a thin
 * crescent still reads. Fills its container — size it from the parent.
 */
export function MoonDisc({
  dayOfMonth,
  monthLength,
  litOpacity,
  className,
}: {
  dayOfMonth: number
  monthLength: number
  litOpacity: number
  className?: string
}) {
  const size = 100
  const c = size / 2
  const r = size * 0.44
  const { illumination, waxing } = moonIllumination(dayOfMonth, monthLength)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={cn('h-full w-full', className)} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="url(#moon-body)" stroke="var(--border)" strokeWidth={size * 0.012} />
      <path d={moonPhasePath(c, c, r, illumination, waxing)} fill="url(#moon-light)" opacity={litOpacity} />
    </svg>
  )
}
