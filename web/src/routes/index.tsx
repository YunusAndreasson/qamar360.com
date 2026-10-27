import { createFileRoute } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'

import { DayPlay } from '#/components/day-play'
import { MonthOrbit } from '#/components/month-orbit'
import { MoonCanvas } from '#/components/moon-canvas'
import { Photo } from '#/components/photo'
import { SiteFooter, SiteHeader } from '#/components/site-chrome'
import { TodaySun } from '#/components/today-sun'
import { Chapter, Passage, Verse } from '#/components/story'
import { YearOrbits } from '#/components/year-orbits'
import { eveningPhase, hijriDate, type HijriDate } from '#/lib/moon'

/**
 * The download site, told as one story with one message: the app sets no reminders, because the
 * prayer is the cue and the moon is the measure. Habit apps keep time with the phone; the Sunnah
 * keeps it by the sky. After that turn the page has two halves: the sun, whose prayers cue what you
 * do each day (stacks), and the moon, an orbit of the real moon that your kept acts fill to 360°.
 * Plan and pace rules: docs/website-plan.md. The app is in neither store yet, so the call to action
 * says it is coming and links nowhere it can't keep.
 */
export const Route = createFileRoute('/')({
  component: Home,
})

/** Tonight's Hijri date, read in the browser after hydration so server and client never disagree. */
function useTonight() {
  const [tonight, setTonight] = useState<HijriDate | null>(null)
  useEffect(() => setTonight(hijriDate(new Date())), [])
  return tonight
}

/** Tonight's moon, drawn in its phase for tonight's Hijri date, with the date beneath it. Until the
 *  browser has read the date, the space is held and nothing is drawn. */
function TonightMoon() {
  const tonight = useTonight()
  const phase = tonight ? eveningPhase(tonight.day, tonight.monthLength) : null
  return (
    <figure className="sky-now reveal" data-ready={tonight ? '' : undefined}>
      <div className="tonight-moon">
        {phase ? <MoonCanvas illumination={phase.illumination} waxing={phase.waxing} brightness={0.85} /> : null}
      </div>
      <figcaption>
        <span className="sky-now-line">
          {tonight ? `Tonight · ${tonight.day} ${tonight.monthName} ${tonight.year}` : '\u00a0'}
        </span>
        <span className="sky-now-note">Drawn from NASA’s maps of the lunar&nbsp;surface.</span>
      </figcaption>
    </figure>
  )
}

/** The one observer behind the page's two motions (site.css, "Motion"): each `.reveal` arrives
 *  once it reaches the viewport, and each `.develop` picture comes up out of the night once it is
 *  there and decoded, so a fast scroll never flashes one in half-drawn. Without JS, or with reduced
 *  motion, all content simply shows (the hidden state is set by a class this effect adds). */
function useReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const items = document.querySelectorAll<HTMLElement>('.reveal, .develop')
    const show = (item: Element) => {
      const img = item.matches('.develop') ? item.querySelector('img') : null
      if (!img) item.classList.add('is-visible')
      // A picture that fails still shows, as the alt text it falls back to.
      else img.decode().catch(() => {}).then(() => item.classList.add('is-visible'))
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show(entry.target)
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    // What is already on the screen when this runs (a reload partway down, a slow hydration) has
    // been seen as it is, so it stays; hiding it now would only blink it dark and back.
    items.forEach((item) => {
      const { top, bottom } = item.getBoundingClientRect()
      if (top < window.innerHeight && bottom > 0) item.classList.add('is-visible')
      else observer.observe(item)
    })
    document.documentElement.classList.add('reveals')
    return () => observer.disconnect()
  }, [])
}

/**
 * A still from the night, letterboxed like a film frame (2.39:1 on a wide screen, a portrait crop
 * on a phone). The photographs are composed with an empty side, so the words sit in the picture's
 * own dark instead of over a shade. Without a side, or on a phone, the words follow the frame like a
 * caption.
 */
function Frame({
  name,
  alt,
  side,
  sharp = false,
  children,
}: {
  name: string
  alt: string
  side?: 'left'
  /** Exported at twice the size too, for a still whose detail must stay crisp (the phone's screen). */
  sharp?: boolean
  children?: ReactNode
}) {
  // A still with words is a section of the page; one without is a pause between them.
  const Tag = children ? 'section' : 'div'
  return (
    <Tag className={`frame frame-${side ?? 'caption'}`}>
      <Photo
        className="frame-photo develop"
        name={`${name}-wide`}
        widths={sharp ? [960, 1536, 2560] : [960, 1536]}
        tall={{ name: `${name}-tall`, widths: sharp ? [600, 820, 1640] : [600, 820] }}
        alt={alt}
      />
      {children ? <div className="frame-words reveal">{children}</div> : null}
    </Tag>
  )
}

function Home() {
  useReveal()
  return (
    <div className="landing">
      {/* Without JavaScript the month cannot play, so its stops simply stand one after another. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>.month-stage{position:static;height:auto;padding-block:64px}.day,.month{height:auto}.day-stage{position:static;height:auto;padding-block:64px}.play-stops,.day-cards{gap:56px}.play-stop,.day-card{grid-area:auto;opacity:1;transform:none}.month-update,.day-close{display:none}</style>',
        }}
      />
      <SiteHeader overlay />
      <main>
        <div className="hero-wrap">
          <section className="hero">
            <Photo
              className="hero-photo"
              name="hero-wide"
              widths={[768, 1536]}
              sizes="(min-width: 900px) 118vw, 100vw"
              tall={{ name: 'hero-tall', widths: [600, 941] }}
              alt="A man walks alone down a wet cobbled street at dusk, under a thin crescent moon."
              priority
            />
            <div className="hero-shade" />
            <div className="hero-words">
              {/* Three lines, broken where the sense breaks: the acts, then the sun, then the moon. */}
              <h1>
                <span>Small acts,</span> <span>kept by the sun</span> <span>and the&nbsp;moon.</span>
              </h1>
              <p className="hero-lede">
                Qamar360 helps you keep the Sunnah without reminders. You tie small acts to the prayers, and see each month’s
                progress as an orbit around the&nbsp;moon.
              </p>
              <p className="coming">Coming to iPhone and Android</p>
            </div>
          </section>
          {/* The app itself, at once: a real screen from the third night of a month, so the crescent
              on it is the crescent in the sky. */}
          <figure className="hero-phone">
            <Photo
              className="hero-screen"
              name="hero-screen"
              widths={[360, 600, 900]}
              sizes="(min-width: 900px) 300px, min(62vw, 320px)"
              alt="Qamar360’s Progress on 3 Jumādā al-Thānī: the month’s orbit at 32° round a thin crescent moon, and the Hijri year as twelve orbits."
              priority
            />
            <figcaption>
              The app on 3 Jumādā al&#8209;Thānī. The crescent on the screen is the one in the&nbsp;sky.
            </figcaption>
          </figure>
        </div>

        {/* The turn: habit apps keep time with the phone; the Sunnah keeps it by the sky. Then its
            two halves: the sun, whose prayers cue what you do each day, and the moon, which counts
            the month and the year. */}
        <section className="story" aria-label="The sky">
          {/* Three beats a step apart: the problem, the turn with the verse that grounds it, the answer.
              The turn and its verse are one claim, so they stand close. */}
          <Passage>
            <p className="reveal">
              Most habit apps run on reminders. A buzz at nine for the Qurʾān, another at ten for water. Within a few
              weeks you swipe them away&nbsp;unread.
            </p>
          </Passage>
          <div className="story-claim">
            <Passage>
              <p className="reveal">
                Muslims kept time long before phones. The sun sets the day, and the moon the&nbsp;month.
              </p>
            </Passage>
            <Verse source="Qurʾān 10:5 · tr. Khattab">
              He is the One Who made the sun a radiant source and the moon a reflected light, with precisely ordained
              phases, so that you may know the number of years and calculation of&nbsp;time.
            </Verse>
          </div>
          <Passage>
            <p className="reveal">
              Qamar360 does the same. The prayers tell you when to act, and the moon shows how much of the month
              you&nbsp;kept.
            </p>
          </Passage>
        </section>

        <Chapter>The sun</Chapter>

        <section className="story story-sun" aria-label="Today’s sun">
          <TodaySun />
          <Verse source="Qurʾān 17:78 · tr. Khattab">
            Observe the prayer from the decline of the sun until the darkness of the night and the dawn prayer, for
            certainly the dawn prayer is witnessed by&nbsp;angels.
          </Verse>
          <Passage>
            <p className="reveal">
              You already pray five times a day. Tie a few small acts to a prayer, and the prayer becomes
              the&nbsp;reminder.
            </p>
            <p className="cite reveal">
              Reminders helped people remember a task but kept it from becoming a habit. Cues from their own routine
              worked&nbsp;better. <span>Stawarz et al., 2015</span>
            </p>
          </Passage>
        </section>

        <DayPlay />

        <Frame
          name="supper"
          side="left"
          alt="A table by a window just after Maghrib, the last red of the sunset low over the rooftops, one place set under a warm lamp, a dark phone lying face down beside the napkin."
        >
          <p className="marker">Maghrib</p>
          <h2>No alarm went&nbsp;off.</h2>
          <p>The sun set, and that was the&nbsp;cue.</p>
        </Frame>

        <Chapter>The moon</Chapter>

        <section className="story story-moon" aria-label="Tonight’s moon">
          <TonightMoon />
          <Verse source="Qurʾān 2:189 · tr. Khattab">
            They ask you about the phases of the moon. Say, ‘They are a means for people to determine time
            and&nbsp;pilgrimage.’
          </Verse>
        </section>

        <MonthOrbit />

        <Frame
          name="rooftop"
          sharp
          alt="On a rooftop at night, a hand holds up a phone showing Qamar360’s Progress: the month’s orbit at 131° round the full moon, while the real full moon hangs over the city behind it."
        />

        <section className="year-section" aria-labelledby="year-title">
          <div className="year-words reveal">
            <h2 id="year-title">Twelve orbits make a year.</h2>
            <p>
              One for each Hijri month, so you can see which ones you kept&nbsp;whole.
            </p>
          </div>
          <div className="reveal">
            <YearOrbits />
          </div>
          <p className="cite year-cite reveal">
            Indeed, the number of months ordained by Allah is&nbsp;twelve. <span>Qurʾān 9:36 · tr. Khattab</span>
          </p>
        </section>

        <section className="scene scene-close">
          <Photo
            className="scene-photo develop"
            name="fajr"
            widths={[768, 1536]}
            alt="The last crescent of the month hangs low over the rooftops before dawn."
          />
          <div className="scene-words close-words reveal">
            <h2>Begin with the next crescent.</h2>
            <p className="coming">Coming to iPhone and Android</p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
