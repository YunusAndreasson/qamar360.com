import type { CSSProperties } from 'react'

import { MoonCanvas } from '#/components/moon-canvas'

/**
 * The app's Progress orbit: the real moon inside one stripe that fills from 0° to 360° over the
 * month. Same proportions as the app's `orbit-drawing.tsx` (a 232-unit orbit, a 16-unit stripe,
 * a 184-unit moon) and the same reading: a groove for the whole 360°, the stripe laid with a sweep
 * from a step down at its start to the full accent at its head, a light at the head, and, when the
 * month is kept whole, solid warm moonlight with a bloom.
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
      <MoonCanvas
        className="orbit-moon"
        illumination={illumination}
        waxing={waxing}
        brightness={closed ? 1 : 0.85}
      />
    </div>
  )
}
