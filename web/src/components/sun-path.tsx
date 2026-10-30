import type { CSSProperties } from 'react'

/**
 * The sun's path through one day, with the five prayers on it, and the sun on it at `hour`: the arc
 * the played day (`day-play.tsx`) moves along, as the month's orbit fills. A diagram of the idea,
 * not a clock, so it is drawn for no place and no date: a sun that peaks at 60°, rising at six and
 * setting at six. Each prayer sits where the
 * sun puts it, by the same definitions the app's prayer acts give (`src/constants/sunnah-habits.ts`):
 * Fajr and ʿIshāʾ with the sun 18° below the horizon, Dhuhr just past its height, ʿAṣr when a
 * shadow equals its object, Maghrib at sunset.
 *
 * The sun on it is the real one that opens this half of the page (`today-sun.tsx`), and it lights the
 * sky of the diagram as it goes (`skyAt`), so the day reads as a day and not as a dot on a line. The
 * horizon stops the light and hides the sun as the ground does, so at Maghrib it stands half set.
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

const smooth = (from: number, to: number, v: number) => {
  const k = Math.min(1, Math.max(0, (v - from) / (to - from)))
  return k * k * (3 - 2 * k)
}

/**
 * The light in the sky at an hour, each share 0–1. `day` is the blue of a sky lit from above. `low` is
 * the warm light of a sun near the horizon, strongest as it sets and gone by ʿIshāʾ, as the prayer's
 * definition has it: the twilight gone. `first` is the cold line of true dawn on the horizon at Fajr,
 * which the rising sun takes over.
 */
export function skyAt(t: number): { day: number; low: number; first: number } {
  const alt = altitude(t)
  const morning = t < 12
  return {
    day: smooth(0, PEAK, alt),
    low: smooth(-16, 0, alt) * (1 - smooth(4, 34, alt)) * (morning ? 0.6 : 1),
    first: morning ? 1 - smooth(-5, 7, alt) : 0,
  }
}

/** Everything drawn that never moves, worked out once. */
const NIGHT_PATHS = [curve(T0, 6), curve(18, T1)]
const DAY_PATH = curve(6, 18)
const START = PRAYERS[0].t

/** The real sun, sharing `today-sun.tsx`'s picture. It is drawn twice, split at the horizon. */
function SunDisc() {
  return (
    <span className="sun-disc">
      <picture>
        <source type="image/avif" srcSet="/sun/sun-288.avif" />
        <img src="/sun/sun-288.webp" alt="" width={288} height={288} loading="lazy" decoding="async" />
      </picture>
    </span>
  )
}

export function SunPath({ hour }: { hour: number }) {
  const sky = skyAt(hour)
  const style = {
    '--sun-x': x(hour) / W,
    '--sun-y': y(hour) / H,
    '--horizon-y': HORIZON / H,
    '--day': sky.day.toFixed(3),
    '--low': sky.low.toFixed(3),
    '--first': sky.first.toFixed(3),
  } as CSSProperties
  return (
    <figure className="sun-path">
      <div className="sun-path-plot" style={style}>
        <div className="sun-sky" aria-hidden="true">
          <i className="sun-sky-day" />
          <i className="sun-sky-low" />
          <i className="sun-sky-first" />
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <line className="sun-horizon" x1={0} x2={W} y1={HORIZON} y2={HORIZON} />
          <path className="sun-night" d={NIGHT_PATHS[0]} />
          <path className="sun-night" d={NIGHT_PATHS[1]} />
          <path className="sun-day" d={DAY_PATH} />
          {hour > START + REACHED ? <path className="sun-trail" d={curve(START, hour)} /> : null}
          {PRAYERS.map((p) => (
            <circle
              key={p.name}
              className="sun-prayer"
              data-below={altitude(p.t) < -1 || undefined}
              data-reached={hour >= p.t - REACHED || undefined}
              data-here={Math.abs(hour - p.t) < REACHED || undefined}
              cx={x(p.t)}
              cy={y(p.t)}
            />
          ))}
        </svg>
        <div className="sun-now sun-now-down" aria-hidden="true">
          <SunDisc />
        </div>
        <div className="sun-now sun-now-up" aria-hidden="true">
          <SunDisc />
        </div>
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
