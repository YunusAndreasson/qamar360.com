import type { CSSProperties, ReactNode } from 'react'

/**
 * One month as the app's year draws it: a thin track and the month's stripe round it, warm once it
 * closes at 360°. The stripe draws itself when the `.reveal` it sits in arrives (site.css, "The
 * month rings"); `order` sets its place in that drawing. Without JS, or with reduced motion, it simply
 * stands at its degrees.
 */
const R = 22
const STROKE = 4
const CIRC = 2 * Math.PI * R

export function MonthRing({ degrees, order = 0, children }: { degrees: number; order?: number; children?: ReactNode }) {
  const len = (Math.min(degrees, 360) / 360) * CIRC
  return (
    <svg className="month-ring" viewBox="0 0 56 56" aria-hidden data-closed={degrees >= 360 || undefined}>
      <circle className="month-ring-track" cx="28" cy="28" r={R} strokeWidth={STROKE} fill="none" />
      <circle
        className="month-ring-stripe"
        cx="28"
        cy="28"
        r={R}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${len} ${CIRC}`}
        style={{ '--len': `${len}px`, '--i': order } as CSSProperties}
        transform="rotate(-90 28 28)"
      />
      {children}
    </svg>
  )
}
