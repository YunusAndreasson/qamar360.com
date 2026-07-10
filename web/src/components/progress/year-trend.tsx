import { Area, AreaChart, CartesianGrid, ReferenceDot, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '#/components/ui/chart'
import { toDegrees, type YearProgress } from '#/lib/progress'
import { usePrefersReducedMotion } from './use-reduced-motion'

type TrendPoint = { month: number; label: string; monthName: string; value: number | null; state: string }

const config = { value: { label: 'Completion', color: 'var(--signal)' } } satisfies ChartConfig

/** Themed tooltip: the Hijri month name over the exact figure in degrees. */
function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  const p = active && payload?.length ? payload[0]!.payload : null
  if (!p || p.value == null) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
      <div className="font-medium text-foreground">{p.monthName}</div>
      <div className="font-mono tabular-nums text-muted-foreground">{toDegrees(p.value)}°</div>
    </div>
  )
}

/**
 * The year in twelve Hijri months as an area trend. Elapsed + current months carry the line; future
 * months drop out (null) so the area ends on the current month — its leading point marked. X is the
 * plain month numeral (1–12); Y is read in orbit degrees, never percent.
 */
export function YearTrend({ year }: { year: YearProgress }) {
  const reduced = usePrefersReducedMotion()
  const data: TrendPoint[] = year.months.map((m) => ({
    month: m.month,
    label: String(m.month),
    monthName: m.monthName,
    value: m.state === 'future' ? null : m.fraction,
    state: m.state,
  }))
  const current = year.months.find((m) => m.state === 'current')

  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity={0.26} />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--hairline)" />
        <XAxis
          dataKey="label"
          interval={0}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 0.5, 1]}
          width={40}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${toDegrees(v)}°`}
          tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' }}
        />
        <ChartTooltip cursor={{ stroke: 'var(--hairline-2)', strokeWidth: 1 }} content={<TrendTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          connectNulls={false}
          stroke="var(--signal)"
          strokeWidth={2}
          fill="url(#trend-fill)"
          dot={false}
          activeDot={{ r: 4, fill: 'var(--signal)', stroke: 'var(--background)', strokeWidth: 2 }}
          isAnimationActive={!reduced}
          animationDuration={900}
          animationEasing="ease-out"
        />
        {current && (
          <ReferenceDot
            x={String(current.month)}
            y={current.fraction}
            r={4}
            fill="var(--signal-hot)"
            stroke="var(--background)"
            strokeWidth={2}
          />
        )}
      </AreaChart>
    </ChartContainer>
  )
}
