/**
 * The sun's path through one day, with the five prayers on it, and the sun on it at `hour`: the arc
 * the played day (`day-play.tsx`) moves along, as the month's orbit fills. A diagram of the idea,
 * not a clock, so it is drawn for no place and no date: a sun that peaks at 60°, rising at six and
 * setting at six. Each prayer sits where the
 * sun puts it, by the same definitions the app's prayer acts give (`src/constants/sunnah-habits.ts`):
 * Fajr and ʿIshāʾ with the sun 18° below the horizon, Dhuhr just past its height, ʿAṣr when a
 * shadow equals its object, Maghrib at sunset.
 */

const W = 1000
const H = 450
const HORIZON = 320
/** Pixels per degree of altitude. */
const K = 4.6
const PEAK = 60
/** The hours drawn, from before Fajr to after ʿIshāʾ. */
const T0 = 4.2
const T1 = 19.8
const PAD = 24

/** The sun's altitude in degrees at an hour of the day. */
export const altitude = (t: number) => PEAK * Math.cos((2 * Math.PI * (t - 12)) / 24)
/** The hour the sun is at an altitude, before noon (`-1`) or after it (`1`). */
const hourAt = (alt: number, side: -1 | 1) => 12 + (side * Math.acos(alt / PEAK) * 24) / (2 * Math.PI)

const x = (t: number) => PAD + ((t - T0) / (T1 - T0)) * (W - 2 * PAD)
const y = (t: number) => HORIZON - altitude(t) * K

function curve(from: number, to: number) {
  const steps = Math.max(2, Math.round((to - from) * 12))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps
    return `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(t).toFixed(1)}`
  }).join(' ')
}

/** ʿAṣr: a shadow as long as its object, on top of the shadow left at noon. */
const ASR_ALT = (Math.atan(1 / (1 + 1 / Math.tan((PEAK * Math.PI) / 180))) * 180) / Math.PI

export type Prayer = {
  name: string
  /** What the sun is doing, said under the name where there is room. */
  sun: string
  t: number
  /** Where the label sits against its mark. */
  place: 'above' | 'below' | 'right' | 'upper-right'
  align: 'start' | 'middle' | 'end'
}

export const PRAYERS: Prayer[] = [
  { name: 'Fajr', sun: 'First light', t: hourAt(-18, -1), place: 'below', align: 'start' },
  { name: 'Dhuhr', sun: 'Past its height', t: 12.3, place: 'above', align: 'middle' },
  { name: 'ʿAṣr', sun: 'Shadows lengthen', t: hourAt(ASR_ALT, 1), place: 'right', align: 'start' },
  { name: 'Maghrib', sun: 'Sunset', t: 18, place: 'upper-right', align: 'start' },
  { name: 'ʿIshāʾ', sun: 'Twilight gone', t: hourAt(-18, 1), place: 'below', align: 'end' },
]

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`

/** A prayer counts as reached once the sun is this close to it, so a stop's mark is lit while
 *  the sun rests on it. */
const REACHED = 0.01

export function SunPath({ hour }: { hour: number }) {
  const start = PRAYERS[0].t
  const below = altitude(hour) < -1
  return (
    <figure className="sun-path">
      <div className="sun-path-plot">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <line className="sun-horizon" x1={0} x2={W} y1={HORIZON} y2={HORIZON} />
          <path className="sun-night" d={curve(T0, 6)} />
          <path className="sun-night" d={curve(18, T1)} />
          <path className="sun-day" d={curve(6, 18)} />
          {hour > start + REACHED ? <path className="sun-trail" d={curve(start, hour)} /> : null}
          {PRAYERS.map((p) => (
            <circle
              key={p.name}
              className="sun-prayer"
              data-below={altitude(p.t) < -1 || undefined}
              data-reached={hour >= p.t - REACHED || undefined}
              cx={x(p.t)}
              cy={y(p.t)}
            />
          ))}
          <circle className="sun-now-glow" data-below={below || undefined} cx={x(hour)} cy={y(hour)} r={34} />
          <circle className="sun-now" data-below={below || undefined} cx={x(hour)} cy={y(hour)} r={11} />
        </svg>
        {PRAYERS.map((p) => (
          <p
            key={p.name}
            className="sun-label"
            data-place={p.place}
            data-align={p.align}
            data-reached={hour >= p.t - REACHED || undefined}
            style={{ left: pct(x(p.t), W), top: pct(y(p.t), H) }}
          >
            <span className="sun-name">{p.name}</span>
            <span className="sun-event">{p.sun}</span>
          </p>
        ))}
      </div>
    </figure>
  )
}
