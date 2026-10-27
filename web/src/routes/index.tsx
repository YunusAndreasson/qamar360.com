import { createFileRoute } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'

import { MonthOrbit } from '#/components/month-orbit'
import { MoonCanvas } from '#/components/moon-canvas'
import { Photo } from '#/components/photo'
import { SiteFooter, SiteHeader } from '#/components/site-chrome'
import { YearOrbits } from '#/components/year-orbits'
import { eveningPhase, hijriDate, type HijriDate } from '#/lib/moon'

/**
 * The download site. Qamar is the moon, 360 its orbit: the page is built round the app's one idea,
 * a month as an orbit of the real moon that your kept acts fill to 360°. Plan and reasoning:
 * docs/website-plan.md. The app is in neither store yet, so the call to action says it is coming
 * and links nowhere it can't keep.
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

/** Tonight's moon, in tonight's phase, with the date beneath it. Until the browser has read the
 *  date, the space is held and nothing is drawn. */
function TonightMoon() {
  const tonight = useTonight()
  const phase = tonight ? eveningPhase(tonight.day, tonight.monthLength) : null
  return (
    <figure className="tonight" data-ready={tonight ? '' : undefined}>
      <div className="tonight-moon">
        {phase ? <MoonCanvas illumination={phase.illumination} waxing={phase.waxing} brightness={0.85} /> : null}
      </div>
      <figcaption>{tonight ? `Tonight · ${tonight.day} ${tonight.monthName} ${tonight.year}` : '\u00a0'}</figcaption>
    </figure>
  )
}

/** Fades sections in once as they reach the viewport. Without JS, or with reduced motion, all
 *  content simply shows (the hidden state is set by a class this effect adds). */
function useReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const items = document.querySelectorAll<HTMLElement>('.reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    document.documentElement.classList.add('reveals')
    items.forEach((item) => observer.observe(item))
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
  side?: 'left' | 'right'
  /** Exported at twice the size too, for a still whose detail must stay crisp (the phone's screen). */
  sharp?: boolean
  children?: ReactNode
}) {
  // A still with words is a section of the page; one without is a pause between them.
  const Tag = children ? 'section' : 'div'
  return (
    <Tag className={`frame frame-${side ?? 'caption'}`}>
      <Photo
        className="frame-photo"
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
            '<style>.month{height:auto}.month-stage{position:static;height:auto;padding-block:64px}.month-stops{gap:56px}.month-stop{grid-area:auto;opacity:1;transform:none}.month-update{display:none}</style>',
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
            <h1>A month is one orbit.</h1>
            <p className="hero-lede">
              Qamar360 is an app for keeping small acts of the Sunnah. The acts you keep fill the Hijri month, and a
              month kept whole closes&nbsp;at&nbsp;360°.
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
        </figure>
        </div>

        <section className="interlude" aria-label="The acts">
          <p className="statement reveal">
            First, the acts: small things from the Sunnah, tied to moments you already keep.
          </p>
        </section>

        <Frame
          name="wudu"
          side="right"
          alt="Before dawn, a man’s hands cupped under an old brass tap, water running into them."
        >
          <p className="marker">Stacks</p>
          <h2>Bilāl prayed after every wuḍūʾ.</h2>
          <p>
            He tied the prayer to something he already did. A stack works the same way: a few acts tied to a moment
            already in your day, such as Fajr, waking up or getting into&nbsp;bed.
          </p>
          <p className="cite">
            The Prophet heard his footsteps in Paradise and asked him why. This was his&nbsp;answer. <span>Bukhari 1149</span>
          </p>
          <p className="source-note">Every act in the app’s library carries its source: a hadith, a verse or a&nbsp;study.</p>
        </Frame>

        <Frame
          name="supper"
          side="left"
          alt="A table by a window after Maghrib, one place set under a warm lamp, a phone lying face down at the corner."
        >
          <p className="marker">Exchanges</p>
          <h2>Plate to the table, screen left behind.</h2>
          <p>
            An exchange puts a good act where an old habit keeps happening: you eat at the table, not at a screen. You
            record what you did, never what you&nbsp;didn’t.
          </p>
          <p className="cite">
            Plans not to do something can make the habit stronger. Plans for what to do instead&nbsp;don’t.{' '}
            <span>Adriaanse et al., 2011</span>
          </p>
        </Frame>

        <Frame
          name="sill"
          side="right"
          sharp
          alt="A phone on a moonlit window sill beside a cup of tea and prayer beads. On its screen, Qamar360’s Today with the Fajr stack open: four of its five acts ticked, a page of Qurʾān still to read."
        >
          <p className="marker">Today</p>
          <h2>One tick for each act you keep.</h2>
          <p>Today lists the day’s to‑dos, stacks, habits and exchanges. Open a stack and tick each act as you do&nbsp;it.</p>
          <p className="cite">
            Keeping a record of what you have done helps you keep doing&nbsp;it. <span>Harkin et al., 2016 · 138 trials</span>
          </p>
        </Frame>

        <Frame
          name="bedside"
          side="left"
          sharp
          alt="In bed at night, a hand holds up a phone. On its screen, Qamar360 closes the day: the full moon, “Alḥamdulillāh”, 17 Jumādā al-Awwal 1448 and 138° this month."
        >
          <p className="marker">Closing the day</p>
          <h2>The last tick closes the day.</h2>
          <p>
            Keep every act due today, with no to‑do left open, and the app closes the day: Alḥamdulillāh, the Hijri
            date, and how far round the month you&nbsp;are.
          </p>
        </Frame>

        <section className="interlude" aria-label="The orbit">
          <div className="reveal">
            <TonightMoon />
          </div>
          <p className="statement reveal">
            Then the orbit: every act you keep moves you round the month, from one crescent to the next.
          </p>
        </section>

        <MonthOrbit />

        <Frame
          name="rooftop"
          sharp
          alt="On a rooftop at night, a hand holds up a phone showing Qamar360’s Progress: the month’s orbit at 131° round the full moon, while the real full moon hangs over the city behind it."
        />

        <section className="year-section" aria-labelledby="year-title">
          <div className="year-words reveal">
            <p className="marker">Progress</p>
            <h2 id="year-title">Twelve orbits make a year.</h2>
            <p>
              The Hijri year is twelve lunar months, so Progress shows twelve orbits. You see at a glance which months
              you kept&nbsp;whole.
            </p>
            <p className="cite">
              The deeds most loved by Allah are the ones done regularly, even if they are&nbsp;small.{' '}
              <span>Bukhari 6464</span>
            </p>
          </div>
          <div className="reveal">
            <YearOrbits />
          </div>
        </section>

        <Frame
          name="rug"
          sharp
          alt="At dawn, a phone lies on the floorboards beside a prayer rug and prayer beads, in moonlight. On its screen, Qamar360’s Today: the week from Saturday to Friday in Hijri dates, a to-do, four stacks and a habit."
        >
          <p className="marker">Hijri time</p>
          <h2>The week ends on Jumuʿah.</h2>
          <p>
            The week on Today runs from Saturday to Friday and counts its days in Hijri dates. The stars behind the app
            are tonight’s real sky, placed by your time zone, so it never needs your&nbsp;location.
          </p>
        </Frame>

        <section className="scene scene-close">
          <Photo
            className="scene-photo"
            name="fajr"
            widths={[768, 1536]}
            alt="The last crescent of the month hangs low over the rooftops before dawn."
          />
          <div className="scene-shade" />
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
