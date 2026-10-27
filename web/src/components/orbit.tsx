import { type CSSProperties, useEffect, useRef, useState } from 'react'

import { MoonCanvas } from '#/components/moon-canvas'

/** The moon's exposure at rest and once the month is kept whole, as the app lights it. */
const AT_REST = 0.85
const LIT = 1
/** How long the moon takes to brighten when the orbit closes, in step with the warm ring's fade. */
const LIGHT_UP = 1200

/** A value that eases to its target over `ms`, so a change of state reads as an event, not a cut.
 *  Under reduced motion it takes the target at once. */
function useEased(target: number, ms: number) {
  const [value, setValue] = useState(target)
  const current = useRef(target)
  useEffect(() => {
    const from = current.current
    if (from === target) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = target
      setValue(target)
      return
    }
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - start) / ms)
      current.current = from + (target - from) * k * k * (3 - 2 * k)
      setValue(current.current)
      if (k < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, ms])
  return value
}

/**
 * The app's Progress orbit: the real moon inside one stripe that fills from 0° to 360° over the
 * month. Same proportions as the app's `orbit-drawing.tsx` (a 232-unit orbit, a 16-unit stripe,
 * a 184-unit moon) and the same reading: a groove for the whole 360°, the stripe laid with a sweep
 * from a step down at its start to the full accent at its head, a light at the head, and, when the
 * month is kept whole, solid warm moonlight with a bloom. The warm ring fades in over the blue one
 * and the moon brightens with it, so closing the month is a moment rather than a cut.
 */
export function Orbit({
  progress,
  illumination,
  waxing,
  className,
}: {
  /** How far round the stripe is, 0–1. */
  progress: number
  illumination: number
  waxing: boolean
  className?: string
}) {
  const p = Math.min(1, Math.max(0, progress))
  const closed = p >= 0.999
  const brightness = useEased(closed ? LIT : AT_REST, LIGHT_UP)
  const style = { '--angle': `${p * 360}deg` } as CSSProperties
  return (
    <div
      className={['orbit', closed && 'orbit-closed', p === 0 && 'orbit-empty', className].filter(Boolean).join(' ')}
      style={style}
    >
      <div className="orbit-bloom" />
      <div className="orbit-glow" style={{ opacity: 0.15 + illumination * 0.35 }} />
      <div className="orbit-track" />
      <div className="orbit-stripe" />
      <div className="orbit-cap orbit-cap-start" />
      <div className="orbit-head">
        <div className="orbit-cap" />
      </div>
      <div className="orbit-warm" />
      <MoonCanvas className="orbit-moon" illumination={illumination} waxing={waxing} brightness={brightness} />
    </div>
  )
}
