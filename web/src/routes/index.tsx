import { createFileRoute } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'

import { DayPlay } from '#/components/day-play'
import { MonthOrbit } from '#/components/month-orbit'
import { MonthRing } from '#/components/month-ring'
import { MoonCanvas } from '#/components/moon-canvas'
import { Photo } from '#/components/photo'
import { SiteFooter, SiteHeader } from '#/components/site-chrome'
import { Chapter, Passage, Verse } from '#/components/story'
import { TodaySun } from '#/components/today-sun'
import { YearOrbits } from '#/components/year-orbits'
import { eveningPhase, hijriDate, type HijriDate, nextMonth } from '#/lib/moon'
import { Site } from '#/site'

/**
 * The download site, told as one story with one message: the app sets no reminders, because the
 * prayer is the cue and the moon is the measure. Habit apps keep time with the phone; the Sunnah
 * keeps it by the sky. After that turn the page has two halves: the sun, whose prayers cue what you
 * do each day (stacks), and the moon, an orbit of the real moon that your kept acts fill to 360°.
 * Plan and pace rules: docs/website-plan.md. The app is in neither store yet, so the call to action
 * says it is coming and links nowhere it can't keep.
 */
export const Route = createFileRoute('/')({
  head: () => ({
    meta: [{ property: 'og:url', content: Site.url }],
    links: [{ rel: 'canonical', href: Site.url }],
  }),
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
        <span className="sky-now-line">Tonight</span>
        <span className="sky-now-fact">
          {tonight ? `${tonight.day} ${tonight.monthName.replaceAll('-', '\u2011')} ${tonight.year}` : '\u00a0'}
        </span>
      </figcaption>
    </figure>
  )
}

/** The opening's two months in the app's own measure: Ramaḍān's orbit closes, then Shawwāl's
 *  starts and stops short. Each is read as the month's orbit is, its degrees over its name, so the
 *  year near the close answers a number the visitor has seen: there Shawwāl holds. */
const SLIP = [
  { month: 'Ramaḍān', degrees: 360 },
  { month: 'Shawwāl', degrees: 70 },
]

function AfterRamadan() {
  return (
    <figure className="slip reveal" role="img" aria-label="Ramaḍān’s orbit closed at 360°. Shawwāl’s stopped at 70°.">
      <ol aria-hidden>
        {SLIP.map((m, i) => (
          <li key={m.month} data-closed={m.degrees >= 360 || undefined}>
            <MonthRing degrees={m.degrees} order={i} />
            <span className="slip-degrees">{m.degrees}°</span>
            {m.month}
          </li>
        ))}
      </ol>
    </figure>
  )
}

/** When the next month begins, by the calendar the app keeps, read in the browser as tonight's moon
 *  is. Until then the line holds its place, so nothing below it moves. */
function NextCrescent() {
  const tonight = useTonight()
  const next = tonight ? nextMonth(tonight) : null
  // A month's name never breaks at its hyphen.
  const name = next?.name.replaceAll('-', '\u2011')
  return (
    <p className="close-next">
      {next ? (next.days === 1 ? `${name} begins tomorrow.` : `${name} begins in ${next.days}\u00a0days.`) : '\u00a0'}
    </p>
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
    // The class goes with the page, so the next page (which shares the footer) shows in full.
    return () => {
      observer.disconnect()
      document.documentElement.classList.remove('reveals')
    }
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
  widths,
  tallWidths,
  children,
}: {
  name: string
  alt: string
  side?: 'left'
  /** The widths the still is exported at (`scripts/export-photo.sh`), wide and portrait. */
  widths: number[]
  tallWidths: number[]
  children?: ReactNode
}) {
  // A still with words is a section of the page; one without is a pause between them.
  const Tag = children ? 'section' : 'div'
  return (
    <Tag className={`frame frame-${side ?? 'caption'}`}>
      <Photo
        className="frame-photo develop"
        name={`${name}-wide`}
        widths={widths}
        tall={{ name: `${name}-tall`, widths: tallWidths }}
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
      {/* Without JavaScript nothing can play and nothing live can be read, so the stops simply stand
          one after another, and a figure that would stay empty (tonight's moon, the unfilled orbit)
          leaves the page. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>.day,.month{height:auto}.day-stage,.month-stage{position:static;height:auto;padding-block:64px}.play-stops,.day-cards{gap:56px}.play-stop,.day-card{grid-area:auto;opacity:1;transform:none}.month-visual,.day-close,.sun-now,.sun-sky,.story-moon .sky-now,.today-sun+figcaption,.close-next{display:none}</style>',
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
              sizes="(min-width: 900px) 112vw, 100vw"
              tall={{ name: 'hero-tall', widths: [600, 941] }}
              alt="A man walks alone down a wet cobbled street at dusk, under a thin crescent moon."
              priority
            />
            <div className="hero-shade" />
            <div className="hero-words">
              {/* Three lines, broken where the sense breaks: the Sunnah, then the sun, then the moon. */}
              <h1>
                <span>Keep the Sunnah</span> <span>by the sun</span> <span>and the&nbsp;moon.</span>
              </h1>
              <p className="hero-lede">
                Tie a few small acts to the prayers you already keep, and see each Hijri month fill an orbit around the moon.
                Qamar360 sets no&nbsp;reminders.
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
              sizes="(min-width: 900px) 36vh, min(62vw, 320px)"
              alt="Qamar360’s Progress on 3 Jumādā al-Thānī: the month’s orbit at 32° round a thin crescent moon, and the Hijri year as twelve orbits."
              priority
            />
            <figcaption>
              The app on 3 Jumādā al&#8209;Thānī, with 32° of the month kept so far. The crescent on the screen is the one
              in the&nbsp;sky.
            </figcaption>
          </figure>
        </div>

        {/* The turn, from the visitor's own year: the acts Ramaḍān makes easy slip away after it, and
            reminders don't bring them back. The Sunnah's answer is the small act kept constant, given
            its time by the sky. Then the page's two halves: the sun, whose prayers cue what you do each
            day, and the moon, which counts the month and the year. */}
        <section className="story" aria-label="The sky">
          {/* Three beats a step apart: what the visitor knows, the Sunnah's answer with the turn it
              grounds, and what the app does with it. The answer and the turn are one claim, so they
              stand close. */}
          <Passage>
            <p className="reveal">
              Every Ramaḍān the good acts come easily: the night prayer, a juzʾ a day, the adhkār after each prayer. By
              Shawwāl most of them have slipped&nbsp;away.
            </p>
            <AfterRamadan />
            <p className="reveal">
              Reminders don’t bring them back. A buzz at nine, another at ten, and within weeks you swipe them
              away&nbsp;unread.
            </p>
          </Passage>
          <div className="story-claim">
            <Verse source="Bukhari 6464">
              The most beloved deed to Allah is the most regular and constant, even if it were&nbsp;little.
            </Verse>
            <Passage>
              <p className="reveal">
                The Sunnah sets its small acts at times that come anyway: the adhkār at the end of each prayer, three days of
                fasting at each full moon. Qamar360 is built on&nbsp;that.
              </p>
            </Passage>
          </div>
        </section>

        <Chapter>The sun</Chapter>

        <section className="story story-sun" aria-label="Today’s sun">
          <TodaySun />
          <Verse source="Qurʾān 17:78">
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
          name="maghrib"
          side="left"
          widths={[960, 1536, 2240]}
          tallWidths={[600, 750]}
          alt="Just after sunset, a man kneels in prayer on a small rug in a dim room. Through the window the last light lies low over the rooftops; on the table, a glass of water and a phone lying face down."
        >
          <p className="marker">Maghrib</p>
          <h2>No alarm went&nbsp;off.</h2>
          <p>The sun set, and that was the&nbsp;cue.</p>
        </Frame>

        <Chapter>The moon</Chapter>

        <section className="story story-moon" aria-label="Tonight’s moon">
          <TonightMoon />
          <Verse source="Qurʾān 2:189">
            They ask you about the phases of the moon. Say, ‘They are a means for people to determine time
            and&nbsp;pilgrimage.’
          </Verse>
        </section>

        <MonthOrbit />

        {/* Exported at twice the size too, so the phone's screen in it stays crisp. */}
        <Frame
          name="rooftop"
          widths={[960, 1536, 2560]}
          tallWidths={[600, 820, 1640]}
          alt="On a rooftop at night, a hand holds up a phone showing Qamar360’s Progress: the month’s orbit at 138° round the full moon, while the real full moon hangs over the city behind it."
        />

        <section className="year-section" aria-labelledby="year-title">
          <div className="year-words reveal">
            <h2 id="year-title">Twelve orbits make a year.</h2>
            <p>
              One for each Hijri month, so you can see which ones reached&nbsp;360°.
            </p>
          </div>
          <div className="reveal">
            <YearOrbits />
          </div>
          <p className="cite year-cite reveal">
            Indeed, the number of months ordained by Allah is&nbsp;twelve. <span>Qurʾān 9:36</span>
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
            <NextCrescent />
            <p className="coming">Coming to iPhone and Android</p>
            {/* As the terms and the privacy policy say. */}
            <p className="close-note">Free, with no ads and no&nbsp;tracking.</p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
