import type { CSSProperties } from 'react'

import { ringMetrics, toDegrees, type MonthProgress } from '#/lib/progress'
import { cn } from '#/lib/utils'
import { MoonDisc, MoonGradients } from './moon-disc'

const SIZE = 208
const STROKE = 12
// The moon fills most of the ring's interior (inner clear radius ≈ 92px), leaving a ~16px gap.
const MOON_D = 170

/**
 * The hero: a 360° orbit ring filled to the month's whole-month completion, wrapping a disc drawn at
 * today's true lunar phase, with the exact figure in degrees beneath it and a "vs last month" pace
 * line. Static (no orbiting dot) — the arc sweep on mount is the only motion, gated by reduced-motion.
 */
export function OrbitGauge({ month }: { month: MonthProgress }) {
  const { ringRadius, circumference, arc, isComplete } = ringMetrics(SIZE, STROKE, month.thisRate)
  const c = SIZE / 2
  const offset = circumference - arc
  const degrees = toDegrees(month.thisRate)
  const prevDegrees = toDegrees(month.previousRate)
  const delta = degrees - prevDegrees

  // A radial tick marking last month's pace by this same day, for direct comparison.
  const prevAngle = (-90 + 360 * Math.min(month.previousRate, 1)) * (Math.PI / 180)
  const tick = (r: number) => ({ x: c + r * Math.cos(prevAngle), y: c + r * Math.sin(prevAngle) })
  const t1 = tick(ringRadius + 6)
  const t2 = tick(ringRadius - 10)

  const label =
    `${degrees} degrees of 360, ${month.monthName} ${month.year}` +
    (month.hasPrevious ? `, versus ${prevDegrees} by this day last month` : '')

  return (
    <div className="flex flex-col items-center">
      <MoonGradients />
      <div className="relative" style={{ width: SIZE, height: SIZE }} role="img" aria-label={label}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden
          className={cn(isComplete && 'drop-shadow-[0_0_12px_color-mix(in_oklab,var(--ok)_55%,transparent)]')}
        >
          <defs>
            <linearGradient id="orbit-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--signal-hot)" />
              <stop offset="100%" stopColor="var(--signal-deep)" />
            </linearGradient>
          </defs>

          {/* orbit track */}
          <circle cx={c} cy={c} r={ringRadius} fill="none" stroke="var(--hairline)" strokeWidth={STROKE} />

          {/* filled arc — sweeps clockwise from 12 o'clock */}
          <circle
            className="orbit-arc"
            cx={c}
            cy={c}
            r={ringRadius}
            fill="none"
            stroke={isComplete ? 'var(--ok)' : 'url(#orbit-grad)'}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            transform={`rotate(-90 ${c} ${c})`}
            style={
              {
                '--orbit-circumference': `${circumference}`,
                '--orbit-offset': `${offset}`,
              } as CSSProperties
            }
          />

          {/* last month's pace tick */}
          {month.hasPrevious && (
            <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="var(--ink-dim)" strokeWidth={2} strokeLinecap="round" />
          )}
        </svg>

        {/* moon at today's true phase, luminous over the ring's centre */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className="drop-shadow-[0_0_14px_color-mix(in_oklab,var(--signal)_32%,transparent)]"
            style={{ width: MOON_D, height: MOON_D }}
          >
            <MoonDisc dayOfMonth={month.dayOfMonth} monthLength={month.monthLength} litOpacity={0.95} />
          </div>
        </div>
      </div>

      <div className="mt-5 text-center">
        <div className="display-title text-5xl leading-none text-foreground tabular-nums">
          {degrees}
          <span className="align-top text-2xl text-muted-foreground">°</span>
        </div>
        <div className="mt-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          of 360° · {month.monthName} {month.year}
        </div>
        {month.hasPrevious && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm">
            <span
              className={cn(
                'tabular-nums',
                delta > 0 ? 'text-ok' : delta < 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {Math.abs(delta)}°
            </span>
            <span className="text-muted-foreground">vs {month.previousMonthName}</span>
          </div>
        )}
      </div>
    </div>
  )
}
