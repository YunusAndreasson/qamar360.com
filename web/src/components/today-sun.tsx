import { useEffect, useState } from 'react'

import { dayToShow, nextPrayer, type Place } from '#/lib/sun'

/**
 * Today's sun, opening the sun's half as tonight's moon opens the moon's: one real sun, a
 * visible-light photograph from NASA's Solar Dynamics Observatory (made into `public/sun/` by
 * `scripts/sun-image.py`, recoloured in the site's warm), and one line saying which prayer the sun
 * brings next where the visitor is. The place comes from the time zone, as the app's sky does (its
 * `src/lib/geo.ts`), so nothing asks for a location. No clock time is shown: the app gives the
 * prayers none, the sun is the cue.
 */

/** Mecca, where the time zone is unknown: the app's own fallback. */
const MECCA: Here = { place: { lat: 21.42, lon: 39.83 }, city: 'Mecca' }

type Here = { place: Place; city: string }

async function locate(): Promise<Here> {
  let zone: string | undefined
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return MECCA
  }
  const { TZ_COORDS } = await import('#/lib/tz-coords')
  const coords = zone ? TZ_COORDS[zone] : undefined
  if (!zone || !coords) return MECCA
  return { place: { lat: coords[0], lon: coords[1] }, city: zone.split('/').pop()!.replaceAll('_', ' ') }
}

/** The next prayer where the visitor is, read in the browser after hydration and once a minute. */
function useNextPrayer() {
  const [here, setHere] = useState<Here | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let live = true
    locate().then((h) => live && setHere(h))
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])
  if (!here) return null
  const day = dayToShow(now, here.place)
  const maghrib = day.prayers[3].at
  // After Maghrib, or once the day shown is tomorrow's, it is night.
  const night = (maghrib !== null && now > maghrib) || now < day.noon - 12 * 3_600_000
  return { city: here.city, prayer: nextPrayer(now, day), night }
}

export function TodaySun() {
  const next = useNextPrayer()
  return (
    <figure className="sky-now reveal" data-ready={next ? '' : undefined}>
      {/* It develops out of the night as the stills do (the page's `useReveal`). */}
      <div className="today-sun develop">
        {/* Twice the size for a sharp screen, where the sunspots are what tell a photograph of the sun
            from a drawn one. */}
        <picture>
          <source type="image/avif" srcSet="/sun/sun-288.avif 1x, /sun/sun-576.avif 2x" />
          <img
            src="/sun/sun-288.webp"
            srcSet="/sun/sun-288.webp 1x, /sun/sun-576.webp 2x"
            alt=""
            width={288}
            height={288}
            loading="lazy"
            decoding="async"
          />
        </picture>
      </div>
      <figcaption>
        <span className="sky-now-line">{next ? `${next.night ? 'Tonight' : 'Today'} in ${next.city}` : '\u00a0'}</span>
        <span className="sky-now-fact">{next ? `${next.prayer} comes\u00a0next` : '\u00a0'}</span>
      </figcaption>
    </figure>
  )
}
