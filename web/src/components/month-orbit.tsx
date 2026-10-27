import { useEffect, useRef, useState } from 'react'

import { NotificationCard } from '#/components/notification-card'
import { Orbit } from '#/components/orbit'
import { eveningPhase } from '#/lib/moon'

/**
 * One month of the app, played by the scroll: a Ramaḍān kept in full. The orbit stays pinned
 * while the page moves; the moon waxes and wanes through its real phases and the stripe fills
 * to 360°. On the four days the app sends its lunar updates (the 1st, 8th, 15th and 22nd, the
 * quarters of the moon) the update itself appears, worded exactly as the app words it
 * (`src/lib/lunar-update.ts`). Degrees are the month so far over the whole month, the app's rule.
 */
const MONTH = 'Ramaḍān'
const LENGTH = 30

type Stop = {
  day: number
  heading: string
  body: string
  /** The lunar update that arrives on this day, as the app writes it. */
  update?: { title: string; body: string }
}

/** Degrees at the start of a day, with every earlier day kept in full. */
const degreesAt = (day: number) => Math.round(((day - 1) / LENGTH) * 360)

const STOPS: Stop[] = [
  {
    day: 1,
    heading: 'It begins at 0°.',
    body: 'Each Hijri month starts a new orbit. The app keeps the Umm al-Qura calendar, and you can move it a day or two to match your\u00a0community.',
    update: {
      title: `New moon · 1 ${MONTH}`,
      body: `${MONTH} begins. 360° ahead of you. The first crescent is out.`,
    },
  },
  {
    day: 8,
    heading: 'Each act you keep moves the stripe.',
    body: 'Keep every act and the stripe keeps pace with the month. Miss a day and it moves less. Nothing turns red, and the orbit has no streak to\u00a0break.',
    update: {
      title: `First quarter · 8 ${MONTH}`,
      body: `A quarter of ${MONTH} is behind you. You’re at ${degreesAt(8)}°. The moon is up now.`,
    },
  },
  {
    day: 15,
    heading: 'Four notifications a month.',
    body: 'One at each quarter of the moon, in the evening, once you allow them. Each says where your month stands, in degrees. There are no daily\u00a0reminders.',
    update: {
      title: `Full moon · 15 ${MONTH}`,
      body: `The White Days, and ${MONTH} half gone. You’re at ${degreesAt(15)}°. The moon is up now.`,
    },
  },
  {
    day: 22,
    heading: 'The moon is the real one.',
    body: 'Drawn from NASA’s maps of the lunar surface, and lit for the day of the Hijri\u00a0month.',
    update: {
      title: `Last quarter · 22 ${MONTH}`,
      body: `${LENGTH - 21} nights left in ${MONTH}. You’re at ${degreesAt(22)}°.`,
    },
  },
  {
    day: LENGTH + 1,
    heading: 'A month kept whole is 360°.',
    body: 'The stripe turns to moonlight and the orbit closes. With the next crescent, a new one\u00a0begins.',
  },
]

/** Where each stop sits on the month, 0–1. */
const STOP_T = STOPS.map((s) => (s.day - 1) / LENGTH)
/** Of each stop's share of the scroll, how much holds still on it so its words can be read. */
const HOLD = 0.4

/** Scroll position (0–1) to month position (0–1): a hold at each stop, an eased run between. */
function monthAt(scroll: number): { t: number; stop: number } {
  const segments = STOPS.length
  const s = Math.min(0.99999, Math.max(0, scroll)) * segments
  const i = Math.floor(s)
  const local = s - i
  if (i >= segments - 1 || local <= HOLD) return { t: STOP_T[Math.min(i, segments - 1)], stop: Math.min(i, segments - 1) }
  const k = (local - HOLD) / (1 - HOLD)
  const eased = k * k * (3 - 2 * k)
  return { t: STOP_T[i] + (STOP_T[i + 1] - STOP_T[i]) * eased, stop: eased < 0.5 ? i : i + 1 }
}

export function MonthOrbit() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [{ t, stop }, setMonth] = useState({ t: 0, stop: 0 })

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = section.getBoundingClientRect()
      const run = rect.height - window.innerHeight
      setMonth(monthAt(run > 0 ? -rect.top / run : 0))
      // 0 while the month is still below the opener, 1 once it fills the screen.
      const k = Math.min(1, Math.max(0, (1 - rect.top / window.innerHeight - 0.35) / 0.55))
      stageRef.current?.style.setProperty('--arrive', String(k * k * (3 - 2 * k)))
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
  const { illumination, waxing } = eveningPhase(dayFloat, LENGTH)
  const degrees = Math.round(t * 360)
  const closed = t >= 1
  const current = STOPS[stop]

  return (
    <section ref={sectionRef} className="month" aria-label="One month in Qamar360">
      <div ref={stageRef} className="month-stage">
        <div className="month-words">
          <p className="marker">Progress · A {MONTH} kept in full</p>
          {/* Every stop is in the document, so the page reads in full without the scroll. */}
          <ol className="month-stops">
            {STOPS.map((s, i) => (
              <li key={s.day} className="month-stop" data-active={i === stop || undefined}>
                <h2>{s.heading}</h2>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="month-visual">
          <div className="month-update">
            {current.update ? (
              <NotificationCard key={current.day} title={current.update.title} body={current.update.body} />
            ) : null}
          </div>
          <Orbit className="month-orbit" progress={t} illumination={illumination} waxing={waxing} />
          <p className="month-reading" aria-live="off">
            <span className="month-degrees">{degrees}°</span>
            <span className="month-day">{closed ? `${MONTH}, kept whole` : `${day} ${MONTH}`}</span>
          </p>
        </div>
      </div>
    </section>
  )
}
