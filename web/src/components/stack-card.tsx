import { MoonCanvas } from '#/components/moon-canvas'

import type { ReactNode } from 'react'

/**
 * The app's Today, drawn on the page: a section label, a stack card and the card that closes the
 * day. Ported from the app (`src/components/stack-card.tsx`, `act-row.tsx`, `completion-ring.tsx`,
 * `day-complete.tsx`) as `orbit.tsx` ports the orbit:
 * its proportions, its dark roles and its wording, so what the page shows is what the app does.
 *
 * One addition the app's day does not make: under each act the page names its source, which the
 * app shows in its library, so the visitor sees at once that every act has one.
 */

export type Act = {
  name: string
  /** The act's source, short: a collection and number, or a verse. */
  source: string
}

const plural = (n: number) => `${n} ${n === 1 ? 'act' : 'acts'}`

/** The header's gauge: a ring that fills with the acts done and, once all are, closes round a
 *  check in the receded tone (the app's `CompletionRing`). */
function Ring({ fraction, complete }: { fraction: number; complete: boolean }) {
  const r = 10.5
  const c = 2 * Math.PI * r
  return (
    <svg
      className="ring"
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-started={fraction > 0 || undefined}
      data-complete={complete || undefined}
    >
      <circle className="ring-track" cx={12} cy={12} r={r} />
      <circle
        className="ring-fill"
        cx={12}
        cy={12}
        r={r}
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - (complete ? 1 : fraction))}
        transform="rotate(-90 12 12)"
      />
      <path className="ring-check" d="M7.6 12.3l3 3 5.8-6.4" pathLength={1} />
    </svg>
  )
}

/** One act's mark: an open circle, or once done a check inside it. */
function Tick({ done }: { done: boolean }) {
  return (
    <svg className="tick" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx={12} cy={12} r={10} />
      {done ? <path d="M7.6 12.3l3 3 5.8-6.4" /> : null}
    </svg>
  )
}

/** The row's door to its sheet. Drawn, not live: the page shows the row, it doesn't run it. */
function More() {
  return (
    <svg className="more" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx={6} cy={12} r={1.6} />
      <circle cx={12} cy={12} r={1.6} />
      <circle cx={18} cy={12} r={1.6} />
    </svg>
  )
}

function Row({ name, sub, done }: { name: string; sub: string; done: boolean }) {
  return (
    <li className="today-row" data-done={done || undefined}>
      <Tick done={done} />
      <span className="today-row-text">
        <span className="today-row-name">{name}</span>
        <span className="today-row-sub">{sub}</span>
      </span>
      <More />
    </li>
  )
}

/** Today's small capitals over a section: TO DO, STACKS, HABITS, EXCHANGES. */
export function TodaySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="today-section">
      <p className="today-label">{label}</p>
      {children}
    </div>
  )
}

/**
 * A stack as Today shows it, open: the gauge, the name, how far through it you are, and its acts
 * in order. `done` acts are ticked; once all are, the card folds to its bar as the app's does.
 */
export function StackCard({ name, acts, done, folded }: { name: string; acts: Act[]; done: number; folded: boolean }) {
  const complete = done >= acts.length
  return (
    <div className="today-card stack-card" data-complete={complete || undefined} data-folded={folded || undefined}>
      <div className="stack-head">
        <Ring fraction={done / acts.length} complete={complete} />
        <span className="today-row-text">
          <span className="stack-name">{name}</span>
          <span className="today-row-sub">{done > 0 ? `${done} of ${plural(acts.length)} done` : plural(acts.length)}</span>
        </span>
        <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d={folded ? 'M7 10l5 5 5-5' : 'M7 14l5-5 5 5'} />
        </svg>
      </div>
      <div className="stack-fold">
        <ul className="stack-acts">
          {acts.map((act, i) => (
            <Row key={act.name} name={act.name} sub={act.source} done={i < done} />
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * The card the app raises when the last act of the day is ticked: the moon, Alḥamdulillāh, the Hijri
 * date and how far round the month you are.
 */
export function DayComplete({
  date,
  degrees,
  daysLeft,
  illumination,
  waxing,
}: {
  date: string
  degrees: number
  daysLeft: number
  illumination: number
  waxing: boolean
}) {
  return (
    <div className="day-complete">
      <div className="day-complete-moon">
        <MoonCanvas illumination={illumination} waxing={waxing} brightness={1} />
      </div>
      <p className="day-complete-title">Alḥamdulillāh</p>
      <p className="day-complete-date">{date}</p>
      <p className="day-complete-degrees">{degrees}°</p>
      <p className="day-complete-sub">this month</p>
      <p className="day-complete-sub">{daysLeft} days left</p>
    </div>
  )
}
