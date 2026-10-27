import { type CSSProperties, useState } from 'react'

import { HIJRI_MONTHS } from '#/lib/moon'

/**
 * The year as the app's Progress shows it: twelve orbits, two rows of six, one per Hijri month,
 * each with its own stripe and only its number at rest. Tap or hover a month to read it, as in the
 * app ("Ṣafar · 360°").
 * The figures are an example year, and the caption says so.
 */
const EXAMPLE = [212, 248, 196, 288, 301, 264, 330, 344, 360, 290, 270, 315]
const RAMADAN = 8

const R = 22
const STROKE = 4
const CIRC = 2 * Math.PI * R

export function YearOrbits() {
  const [selected, setSelected] = useState<number | null>(null)
  const reading = selected === null ? 'An example year' : `${HIJRI_MONTHS[selected]} · ${EXAMPLE[selected]}°`
  return (
    <figure className="year">
      <ol className="year-grid">
        {EXAMPLE.map((degrees, i) => {
          const closed = degrees >= 360
          return (
            <li key={HIJRI_MONTHS[i]}>
              <button
                type="button"
                className="year-month"
                data-closed={closed || undefined}
                data-ramadan={i === RAMADAN || undefined}
                aria-pressed={selected === i}
                aria-label={`${HIJRI_MONTHS[i]}, ${degrees}°`}
                onClick={() => setSelected(selected === i ? null : i)}
                // Hover reads a month only for a mouse. A tap also fires the pointer's enter just
                // before its click, and the click would then toggle the month straight back off.
                onPointerEnter={(e) => e.pointerType === 'mouse' && setSelected(i)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setSelected(null)}
              >
                <svg viewBox="0 0 56 56" aria-hidden>
                  <circle className="year-track" cx="28" cy="28" r={R} strokeWidth={STROKE} fill="none" />
                  <circle
                    className="year-stripe"
                    cx="28"
                    cy="28"
                    r={R}
                    strokeWidth={STROKE}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(degrees / 360) * CIRC} ${CIRC}`}
                    // Drawn once as the year comes into view (site.css), Ramaḍān closing last.
                    style={{ '--len': `${(degrees / 360) * CIRC}px`, '--i': i === RAMADAN ? 12 : i } as CSSProperties}
                    transform="rotate(-90 28 28)"
                  />
                  <text x="28" y="28" textAnchor="middle" dominantBaseline="central">
                    {i + 1}
                  </text>
                </svg>
              </button>
            </li>
          )
        })}
      </ol>
      <figcaption className="year-reading" aria-live="polite">
        {reading}
      </figcaption>
    </figure>
  )
}
