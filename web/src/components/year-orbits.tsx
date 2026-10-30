import { useState } from 'react'

import { MonthRing } from '#/components/month-ring'
import { HIJRI_MONTHS } from '#/lib/moon'

/**
 * The year as the app's Progress shows it: twelve orbits, two rows of six, one per Hijri month,
 * each with its own stripe and only its number at rest. Tap or hover a month to read it, as in the
 * app ("Ṣafar · 360°").
 * The figures are an example year, and the caption says so. It answers the page's opening, where
 * the acts slip after Ramaḍān: here Shawwāl holds, so it draws last, after Ramaḍān closes, and the
 * caption names it once before it goes back to saying what the year is.
 */
const EXAMPLE = [212, 248, 196, 288, 301, 264, 330, 344, 360, 290, 270, 315]
const RAMADAN = 8
const SHAWWAL = 9

/** The order the stripes draw in: the months in turn, Ramaḍān last. Shawwāl then waits for it to
 *  close (site.css, `--shawwal-at`). */
const drawOrder = (i: number) => (i === RAMADAN ? 12 : i)

export function YearOrbits() {
  const [selected, setSelected] = useState<number | null>(null)
  return (
    <figure className="year">
      <ol className="year-grid">
        {EXAMPLE.map((degrees, i) => (
          <li key={HIJRI_MONTHS[i]}>
            <button
              type="button"
              className="year-month"
              data-ramadan={i === RAMADAN || undefined}
              data-shawwal={i === SHAWWAL || undefined}
              aria-pressed={selected === i}
              aria-label={`${HIJRI_MONTHS[i]}, ${degrees}°`}
              onClick={() => setSelected(selected === i ? null : i)}
              // Hover reads a month only for a mouse. A tap also fires the pointer's enter just
              // before its click, and the click would then toggle the month straight back off.
              onPointerEnter={(e) => e.pointerType === 'mouse' && setSelected(i)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setSelected(null)}
            >
              <MonthRing degrees={degrees} order={drawOrder(i)}>
                <text x="28" y="28" textAnchor="middle" dominantBaseline="central">
                  {i + 1}
                </text>
              </MonthRing>
            </button>
          </li>
        ))}
      </ol>
      {/* The three readings stand in one place and stay mounted, so reading a month never replays
          Shawwāl's beat. */}
      <figcaption className="year-reading" data-reading={selected !== null || undefined}>
        <span className="year-reading-rest">An example year</span>
        {/* Shown once, as Shawwāl's stripe finishes (site.css); a reader hears the caption only. */}
        <span className="year-reading-beat" aria-hidden>
          {HIJRI_MONTHS[SHAWWAL]} · {EXAMPLE[SHAWWAL]}°
        </span>
        <span className="year-reading-month" aria-live="polite">
          {selected === null ? '' : `${HIJRI_MONTHS[selected]} · ${EXAMPLE[selected]}°`}
        </span>
      </figcaption>
    </figure>
  )
}
