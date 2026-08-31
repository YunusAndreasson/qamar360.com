import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
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
        >
          {/* orbit track */}
          <circle cx={c} cy={c} r={ringRadius} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />

          {/* filled arc — sweeps clockwise from 12 o'clock */}
          <circle
            className="orbit-arc"
            cx={c}
            cy={c}
            r={ringRadius}
            fill="none"
            stroke={isComplete ? 'var(--success)' : 'var(--primary)'}
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
            <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="var(--muted-foreground)" strokeWidth={2} strokeLinecap="round" />
          )}
        </svg>

        {/* moon at today's true phase, luminous over the ring's centre */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            style={{ width: MOON_D, height: MOON_D }}
          >
            <MoonDisc dayOfMonth={month.dayOfMonth} monthLength={month.monthLength} litOpacity={0.95} />
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <div className="text-6xl font-semibold leading-none tracking-tight text-foreground">
          {degrees}
          <span className="align-top text-2xl text-muted-foreground">°</span>
        </div>
        <div className="mt-2.5 text-sm text-muted-foreground">of a 360° orbit</div>
        {month.hasPrevious && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <span
              className={cn(
                'inline-flex items-center gap-1 tabular-nums',
                delta === 0 ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {delta > 0 ? (
                <TrendingUp aria-hidden className="size-3.5" />
              ) : delta < 0 ? (
                <TrendingDown aria-hidden className="size-3.5" />
              ) : (
                <Minus aria-hidden className="size-3.5" />
              )}
              {Math.abs(delta)}°
            </span>
            <span>vs {month.previousMonthName}</span>
          </div>
        )}
      </div>
    </div>
  )
}
