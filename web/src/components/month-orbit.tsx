import { useEffect, useRef, useState } from 'react'

import { NotificationCard } from '#/components/notification-card'
import { Orbit } from '#/components/orbit'
import { eveningPhase } from '#/lib/moon'
import { arrival, departure, type Play, playAt } from '#/lib/play'

/**
 * One month of the app, played by the scroll: a Shaʿbān kept in full, the month before Ramaḍān.
 * The orbit stays pinned while the page moves; the moon waxes and wanes through its real phases
 * and the stripe fills to 360°. Each stop is told by the moon and the Sunnah, and on the days the
 * app sends its lunar updates (the 1st, 8th, 15th and 22nd, the quarters of the moon) the update
 * itself appears, worded exactly as the app words it (`src/lib/lunar-update.ts`). Degrees are the
 * month so far over the whole month, the app's rule.
 */
const MONTH = 'Shaʿbān'
const LENGTH = 30

type Stop = {
  day: number
  heading: string
  body?: string
  /** A short source line under the body: the text and where it is from. */
  cite?: { text: string; source: string }
  /** A text from the hadith set as a verse, in place of a body (the last stop's). */
  verse?: { text: string; source: string }
  /** The lunar update that arrives on this day, as the app writes it. */
  update?: { title: string; body: string }
}

/** Degrees at the start of a day, with every earlier day kept in full. */
const degreesAt = (day: number) => Math.round(((day - 1) / LENGTH) * 360)

const STOPS: Stop[] = [
  {
    day: 1,
    heading: 'It begins with the crescent.',
    body: 'Each Hijri month starts a new orbit at 0°. The app sends a notification at each quarter of the moon, four a\u00a0month.',
    update: {
      title: `New moon · 1 ${MONTH}`,
      body: `${MONTH} begins. 360° ahead of you. The first crescent is out.`,
    },
  },
  {
    day: 8,
    heading: 'Each act you keep fills the orbit.',
    body: 'Miss one and it fills a little less. It never turns red or goes back to\u00a0zero.',
    update: {
      title: `First quarter · 8 ${MONTH}`,
      body: `A quarter of ${MONTH} is behind you. You’re at ${degreesAt(8)}°. The moon is up now.`,
    },
  },
  {
    day: 15,
    heading: 'Halfway is the full moon.',
    body: 'The 13th to the 15th are the White Days, Ayyām\u00a0al‑Bīḍ, the Sunnah fasts of the full\u00a0moon.',
    cite: {
      text: 'When you fast three days of a month, fast the thirteenth, fourteenth and\u00a0fifteenth.',
      source: 'Tirmidhi 761, ḥasan',
    },
    update: {
      title: `Full moon · 15 ${MONTH}`,
      body: `The White Days, and ${MONTH} half gone. You’re at ${degreesAt(15)}°. The moon is up now.`,
    },
  },
  {
    day: 22,
    heading: `Nine nights of ${MONTH} left.`,
    cite: {
      text: `The Prophet\u00a0ﷺ fasted in no month more than in ${MONTH}, apart from\u00a0Ramaḍān.`,
      source: 'Bukhari 1969',
    },
    update: {
      title: `Last quarter · 22 ${MONTH}`,
      body: `${LENGTH - 21} nights left in ${MONTH}. You’re at ${degreesAt(22)}°.`,
    },
  },
  {
    day: LENGTH + 1,
    heading: 'The orbit closes.',
    verse: {
      text: 'Start fasting when you see the crescent, and stop when you see it. If the sky is overcast, complete thirty days of\u00a0Shaʿbān.',
      source: 'Bukhari 1909',
    },
  },
]

/** Where each stop sits on the month, 0–1. */
const STOP_T = STOPS.map((s) => (s.day - 1) / LENGTH)
/** Of each stop's share of the scroll, how much holds still on it so its words can be read. */
const HOLD = 0.4
/**
 * Days the moon moves on while a stop holds. The stripe and the degrees wait on the stop's day, as
 * the app's count waits for the next tick, but the moon in the sky never stops, so it keeps waxing
 * or waning through the hold. The last stop holds longest and carries the next month's crescent up
 * out of the dark, the one its verse watches for.
 */
const DRIFT = 0.8
const DRIFT_LAST = 1.2

/** The moon's day for a place in the scroll: drifting through each hold, then running on from where
 *  it drifted to, so it never jumps back. */
function moonDay({ held, from, run }: Play): number {
  const day = STOPS[from].day
  if (from === STOPS.length - 1) return day + held * DRIFT_LAST
  if (run === 0) return day + held * DRIFT
  return day + DRIFT + (STOPS[from + 1].day - day - DRIFT) * run
}

export function MonthOrbit() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [play, setMonth] = useState<Play>({ t: 0, stop: 0, held: 0, from: 0, run: 0 })
  const { t, stop } = play

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = section.getBoundingClientRect()
      const run = rect.height - window.innerHeight
      setMonth(playAt(run > 0 ? -rect.top / run : 0, STOP_T, HOLD))
      // The stage fades in as the section arrives and back out into the night as it leaves.
      const here = arrival(rect.top, window.innerHeight) * departure(rect.bottom, window.innerHeight)
      stageRef.current?.style.setProperty('--arrive', String(here))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const dayFloat = 1 + t * LENGTH
  const day = Math.min(LENGTH, Math.floor(dayFloat))
  const { illumination, waxing } = eveningPhase(moonDay(play), LENGTH)
  const degrees = Math.round(t * 360)
  const current = STOPS[stop]

  return (
    <section ref={sectionRef} className="month" aria-label="One month in Qamar360">
      <div ref={stageRef} className="month-stage">
        <div className="month-words">
          <p className="marker">A {MONTH}, every act kept</p>
          {/* Every stop is in the document, so the page reads in full without the scroll. */}
          <ol className="play-stops">
            {STOPS.map((s, i) => (
              <li key={s.day} className="play-stop" data-active={i === stop || undefined}>
                <h2>{s.heading}</h2>
                {s.body ? <p>{s.body}</p> : null}
                {s.cite ? (
                  <p className="cite">
                    <span className="cite-text">{s.cite.text}</span> <span>{s.cite.source}</span>
                  </p>
                ) : null}
                {s.verse ? (
                  <blockquote className="month-verse">
                    <p>{s.verse.text}</p>
                    <footer>{s.verse.source}</footer>
                  </blockquote>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <div className="month-visual">
          <div className="month-update">
            {/* Every update lies in the slot unseen, so the slot is always as tall as the tallest one
                and the orbit under it never moves when a shorter or longer update arrives. */}
            {STOPS.map((s) =>
              s.update ? (
                <div key={s.day} className="month-update-sizer" aria-hidden="true">
                  <NotificationCard title={s.update.title} body={s.update.body} />
                </div>
              ) : null,
            )}
            {current.update ? (
              <NotificationCard key={current.day} title={current.update.title} body={current.update.body} />
            ) : null}
          </div>
          {/* The moon takes the height the update, the reading and the words leave (site.css). */}
          <div className="month-picture">
            <Orbit className="month-orbit" progress={t} illumination={illumination} waxing={waxing} />
          </div>
          <p className="month-reading" aria-live="off">
            <span className="month-degrees">{degrees}°</span>
            <span className="month-day">
              {day} {MONTH}
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}
