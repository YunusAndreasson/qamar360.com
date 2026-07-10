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
        {/* the unlit sphere: a soft top-left highlight falling to a dark limb */}
        <radialGradient id="moon-body" cx="34%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#1c2637" />
          <stop offset="52%" stopColor="#0d121b" />
          <stop offset="100%" stopColor="#06080d" />
        </radialGradient>
        {/* moonlight: bright near the disc's face, cooling to steel at the limb */}
        <radialGradient id="moon-light" cx="40%" cy="36%" r="82%">
          <stop offset="0%" stopColor="var(--signal-hot)" />
          <stop offset="58%" stopColor="var(--signal)" />
          <stop offset="100%" stopColor="var(--signal-deep)" />
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
      <circle cx={c} cy={c} r={r} fill="url(#moon-body)" stroke="var(--hairline)" strokeWidth={size * 0.012} />
      <path d={moonPhasePath(c, c, r, illumination, waxing)} fill="url(#moon-light)" opacity={litOpacity} />
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--signal)" strokeWidth={size * 0.01} opacity={0.12 * litOpacity} />
    </svg>
  )
}
