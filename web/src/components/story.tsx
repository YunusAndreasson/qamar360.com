import type { ReactNode } from 'react'

/**
 * The type the home page tells its story in, between the photographs. Three pieces, all Inter:
 * a chapter's title card, a passage of prose, and a verse (a line of Qurʾān or hadith set on its
 * own). Each piece fades in once through the page's `useReveal`; without JS, or with reduced
 * motion, it simply shows.
 */

/** A chapter's title card: the half of the story it opens, in small spaced capitals on a short
 *  horizon line. */
export function Chapter({ children }: { children: ReactNode }) {
  return (
    <p className="chapter reveal">
      <span>{children}</span>
    </p>
  )
}

/** Prose read top to bottom, set large and light in a narrow column. Each paragraph arrives on its
 *  own as it reaches the screen. */
export function Passage({ children }: { children: ReactNode }) {
  return <div className="passage">{children}</div>
}

/** A text from the Qurʾān or the hadith, alone on the night, with its source beneath. */
export function Verse({ source, children }: { source: string; children: ReactNode }) {
  return (
    <figure className="verse reveal">
      <blockquote>
        <p>{children}</p>
      </blockquote>
      <figcaption>{source}</figcaption>
    </figure>
  )
}
