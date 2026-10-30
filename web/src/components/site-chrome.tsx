import { Link } from '@tanstack/react-router'

import { Site } from '#/site'

/**
 * The Qamar mark: a pure geometric "Q", a circle with the tail crossing it at the lower right.
 * The app icon's geometry (assets/logo/qamar-icon.svg), with the stroke drawn heavier for its
 * small size, as the favicon's is: the icon's 48 would be 1.1px at 24px, which a 1x screen smears
 * into a grey, grainy ring beside the semibold wordmark. 75 is 1.75px, the weight of the letters.
 * Inherits `currentColor`.
 */
export function QamarMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" aria-hidden>
      <circle cx="512" cy="512" r="312" stroke="currentColor" strokeWidth="75" />
      <line x1="703" y1="703" x2="789" y2="789" stroke="currentColor" strokeWidth="75" strokeLinecap="round" />
    </svg>
  )
}

/** The wordmark. `overlay` lays it over a full-bleed photograph instead of above the content. */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={overlay ? 'site-header site-header-overlay' : 'site-header'}>
      <Link to="/" className="wordmark" aria-label="Qamar360 home">
        <QamarMark />
        <span>
          Qamar<span className="wordmark-360">360</span>
        </span>
      </Link>
    </header>
  )
}

/** The footer. It arrives as the page's last words do, where the page plays its motion (`useReveal`
 *  in routes/index.tsx); elsewhere it simply stands. */
export function SiteFooter() {
  return (
    <footer className="site-footer reveal">
      {/* Two groups, the site's own pages and its accounts elsewhere, so a narrow screen breaks
          between them and never strands one link on a line. */}
      <nav aria-label="Site">
        <span>
          <Link to="/privacy" activeProps={{ 'aria-current': 'page' }}>
            Privacy
          </Link>
          <Link to="/terms" activeProps={{ 'aria-current': 'page' }}>
            Terms
          </Link>
          <Link to="/support" activeProps={{ 'aria-current': 'page' }}>
            Support
          </Link>
        </span>
        <span>
          <a href={Site.instagram}>Instagram</a>
          <a href={Site.x}>X</a>
        </span>
      </nav>
      <p>
        <a href={Site.maker.url} rel="author">
          Made by {Site.maker.name}
        </a>
      </p>
    </footer>
  )
}
