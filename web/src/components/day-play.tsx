import { useEffect, useRef, useState } from 'react'

import { type Act, DayComplete, StackCard, TodaySection } from '#/components/stack-card'
import { PRAYERS, SunPath } from '#/components/sun-path'
import { eveningPhase } from '#/lib/moon'
import { arrival, departure, playAt } from '#/lib/play'

/**
 * One day of the app, played by the scroll: the sun's half of the page, as `MonthOrbit` is the
 * moon's. The sun travels its arc and stops at each prayer; there that prayer's stack is on Today
 * and its acts are ticked one by one. The stacks are the app's own curated ones
 * (`src/constants/curated-stacks.ts`), trimmed to their first few acts, with the acts' names as the
 * app writes them (`src/constants/sunnah-habits.ts`) and their sources checked on sunnah.com. At
 * ʿIshāʾ the last tick closes the day.
 *
 * The day is the first of the month the moon's half then plays, so the card that closes it reads
 * one day of thirty kept whole, 12°. It is raised after Maghrib, so its date is the next Hijri day,
 * as the app's is.
 */

type Words = {
  marker: string
  heading: string
  body: string
  cite?: { text: string; source: string }
}

const WORDS: Words[] = [
  {
    marker: 'Stacks',
    heading: 'The day starts at Fajr.',
    body: 'The acts you tie to it make a stack. Tick each one off as you do\u00a0it.',
    cite: {
      text: 'The Prophet asked Bilāl why he heard his footsteps in Paradise. Bilāl said he prayed after every\u00a0wuḍūʾ.',
      source: 'Bukhari 1149',
    },
  },
  {
    marker: 'Stacks',
    heading: 'Each prayer has its own stack.',
    body: 'Dhuhr just after noon, ʿAṣr as the shadows lengthen, Maghrib at\u00a0sunset.',
  },
  {
    marker: 'ʿIshāʾ',
    heading: 'The last act closes the day.',
    body: 'The app then shows the Hijri date and how far round the month you\u00a0are.',
  },
]

type Stop = {
  /** The prayer the sun rests on, by its place in `PRAYERS`. */
  prayer: number
  /** The words beside it, by their place in `WORDS`; Dhuhr, ʿAṣr and Maghrib share theirs. */
  words: number
  /** Its share of the scroll: the three passing prayers are shorter. */
  weight: number
  stack: Act[]
}

const RAWATIB = 'Tirmidhi 415, ṣaḥīḥ'
const ON_TIME = 'Bukhari 527'

const STOPS: Stop[] = [
  {
    prayer: 0,
    words: 0,
    weight: 1.2,
    stack: [
      { name: 'Prayed two rakʿah before Fajr', source: 'Muslim 725' },
      { name: 'Prayed Fajr on time', source: ON_TIME },
      { name: 'Said the morning adhkār', source: 'Qurʾān 33:41–42' },
      { name: 'Read 1 page of Qurʾān', source: 'Muslim 804' },
    ],
  },
  {
    prayer: 1,
    words: 1,
    weight: 0.8,
    stack: [
      { name: 'Prayed four rakʿah before Dhuhr', source: RAWATIB },
      { name: 'Prayed Dhuhr on time', source: ON_TIME },
      { name: 'Prayed two rakʿah after Dhuhr', source: RAWATIB },
    ],
  },
  {
    prayer: 2,
    words: 1,
    weight: 0.8,
    stack: [
      { name: 'Prayed four rakʿah before ʿAṣr', source: 'Tirmidhi 430, ḥasan' },
      { name: 'Prayed ʿAṣr on time', source: 'Bukhari 552' },
    ],
  },
  {
    prayer: 3,
    words: 1,
    weight: 0.8,
    stack: [
      { name: 'Prayed Maghrib on time', source: ON_TIME },
      { name: 'Prayed two rakʿah after Maghrib', source: RAWATIB },
      { name: 'Said the evening adhkār', source: 'Qurʾān 33:41–42' },
    ],
  },
  {
    prayer: 4,
    words: 2,
    weight: 1.6,
    stack: [
      { name: 'Prayed ʿIshāʾ on time', source: 'Bukhari 657' },
      { name: 'Prayed two rakʿah after ʿIshāʾ', source: RAWATIB },
      { name: 'Prayed Witr before sleeping', source: 'Bukhari 998' },
    ],
  },
]

const NAMES = PRAYERS.map((p) => p.name)
const HOURS = STOPS.map((s) => PRAYERS[s.prayer].t)
const WEIGHTS = STOPS.map((s) => s.weight)
const HOLD = 0.6
const LAST = STOPS.length - 1
/** Of a stop's hold, the part its ticks take; the rest stands finished before it folds. */
const TICKING = 0.7
/** Of the last stop's hold, where the ticks end and where the day closes. */
const LAST_TICKING = 0.4
const CLOSES = 0.5

/** The day closes as the app's would on the 1st of a 30-day month, with every act kept. */
const MONTH_LENGTH = 30
const CLOSE_DATE = '2 Shaʿbān 1448'
const CLOSE_PHASE = eveningPhase(2, MONTH_LENGTH)

/** How many of a stop's acts stand ticked. */
function ticked(stop: Stop, index: number, at: number, held: number) {
  const items = stop.stack.length
  if (index < at) return items
  if (index > at) return 0
  const span = index === LAST ? LAST_TICKING : TICKING
  return Math.min(items, Math.floor((held / span) * items + 1e-6))
}

export function DayPlay() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [{ t: hour, stop, held }, setDay] = useState({ t: HOURS[0], stop: 0, held: 0 })

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = section.getBoundingClientRect()
      const run = rect.height - window.innerHeight
      setDay(playAt(run > 0 ? -rect.top / run : 0, HOURS, HOLD, WEIGHTS))
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

  const words = STOPS[stop].words
  const closed = stop === LAST && held >= CLOSES

  return (
    <section ref={sectionRef} className="day" aria-label={`One day in Qamar360, ${NAMES[0]} to ${NAMES[LAST]}`}>
      <div ref={stageRef} className="day-stage">
        <div className="day-words">
          {/* Every stop's words are in the document, so the page reads in full without the scroll. */}
          <ol className="play-stops">
            {WORDS.map((w, i) => (
              <li key={w.heading} className="play-stop" data-active={i === words || undefined}>
                <p className="marker">{w.marker}</p>
                <h2>{w.heading}</h2>
                <p>{w.body}</p>
                {w.cite ? (
                  <p className="cite">
                    {w.cite.text} <span>{w.cite.source}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <div className="day-visual">
          <SunPath hour={hour} />
          <ol className="day-cards" aria-label="Today, as each prayer comes due">
            {STOPS.map((s, i) => {
              const done = ticked(s, i, stop, held)
              const folded = i < stop || (i === stop && (i === LAST ? held >= CLOSES : held >= 0.92))
              return (
                <li key={s.prayer} className="day-card" data-active={i === stop || undefined}>
                  <TodaySection label="Stacks">
                    <StackCard
                      name={PRAYERS[s.prayer].name}
                      acts={s.stack}
                      done={done}
                      folded={folded}
                    />
                  </TodaySection>
                </li>
              )
            })}
          </ol>
          <div className="day-close" data-shown={closed || undefined}>
            <DayComplete
              date={CLOSE_DATE}
              degrees={Math.round(360 / MONTH_LENGTH)}
              daysLeft={MONTH_LENGTH - 1}
              illumination={CLOSE_PHASE.illumination}
              waxing={CLOSE_PHASE.waxing}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
