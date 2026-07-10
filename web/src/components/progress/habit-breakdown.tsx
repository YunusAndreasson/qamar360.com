import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'

import { RowCard, RowList } from '#/components/console'
import { ringMetrics, toDegrees, type HabitStat } from '#/lib/progress'

/** A small completion ring for one habit's rate over the window. */
function MiniRing({ fraction }: { fraction: number }) {
  const size = 34
  const stroke = 4
  const c = size / 2
  const { ringRadius, circumference, arc, isComplete } = ringMetrics(size, stroke, fraction)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
      <circle cx={c} cy={c} r={ringRadius} fill="none" stroke="var(--hairline)" strokeWidth={stroke} />
      <circle
        cx={c}
        cy={c}
        r={ringRadius}
        fill="none"
        stroke={isComplete ? 'var(--ok)' : 'var(--signal)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - arc}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  )
}

/** A bare completion trend for one habit — no axes, one signal line on a shared 0–1 scale. */
function Sparkline({ series }: { series: HabitStat['series'] }) {
  if (series.length < 2) return <span className="font-mono text-xs text-muted-foreground/60">—</span>
  const data = series.map((s, i) => ({ i, v: s.fraction }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <YAxis hide domain={[0, 1]} />
        <Line type="monotone" dataKey="v" stroke="var(--signal)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** "By habit": one row per habit, ranked by rate — a small-multiples comparison of who's on pace. */
export function HabitBreakdown({ stats }: { stats: HabitStat[] }) {
  const ranked = [...stats].sort((a, b) => b.rate - a.rate)
  return (
    <RowList>
      {ranked.map((h) => (
        <RowCard key={h.id} className="items-center gap-4 py-3">
          <MiniRing fraction={h.rate} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground">{h.name}</div>
            <div className="font-mono text-xs tabular-nums text-muted-foreground">{toDegrees(h.rate)}°</div>
          </div>
          <div className="h-8 w-24 shrink-0 sm:w-32">
            <Sparkline series={h.series} />
          </div>
        </RowCard>
      ))}
    </RowList>
  )
}
