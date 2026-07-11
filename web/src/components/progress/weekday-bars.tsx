import { Bar, BarChart, Cell, XAxis } from 'recharts'

import { ChartContainer, ChartTooltip, type ChartConfig } from '#/components/ui/chart'
import { toDegrees } from '#/lib/progress'
import { usePrefersReducedMotion } from './use-reduced-motion'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const config = { value: { label: 'Completion', color: 'var(--signal)' } } satisfies ChartConfig

type BarDatum = { weekday: number; label: string; value: number; sample: number }

/** Themed tooltip: the weekday over its average in degrees. */
function BarTooltip({ active, payload }: { active?: boolean; payload?: { payload: BarDatum }[] }) {
  const p = active && payload?.length ? payload[0]!.payload : null
  if (!p || p.sample === 0) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
      <div className="font-medium text-foreground">{DOW[p.weekday]}</div>
      <div className="font-mono tabular-nums text-muted-foreground">{toDegrees(p.value)}°</div>
    </div>
  )
}

/**
 * "Best day of week": seven columns, one per weekday, at the day's average completion. The strongest
 * day burns bright; the rest sit back in muted steel — a column form that reads at a glance and looks
 * nothing like the line/rings elsewhere on the page. A short line names the winner.
 */
export function WeekdayBars({ rates }: { rates: { weekday: number; rate: number; sample: number }[] }) {
  const reduced = usePrefersReducedMotion()
  const data: BarDatum[] = rates.map((r) => ({ weekday: r.weekday, label: DOW[r.weekday]!, value: r.rate, sample: r.sample }))

  // The winner drives both the highlight and the caption; ignore weekdays with nothing scheduled yet.
  let best = -1
  data.forEach((d, i) => {
    if (d.sample > 0 && (best < 0 || d.value > data[best]!.value)) best = i
  })

  return (
    <div>
      <ChartContainer config={config} className="h-[188px] w-full">
        <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            interval={0}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fontSize: 12, fontFamily: 'var(--font-sans)', fill: 'var(--muted-foreground)' }}
          />
          <ChartTooltip cursor={{ fill: 'var(--hairline)' }} content={<BarTooltip />} />
          <Bar dataKey="value" radius={[5, 5, 0, 0]} isAnimationActive={!reduced} animationDuration={800}>
            {data.map((_, i) => (
              <Cell key={i} fill="var(--signal)" fillOpacity={i === best ? 0.95 : 0.28} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="mt-3 text-sm text-muted-foreground">
        {best >= 0 ? (
          <>
            You show up most on{' '}
            <span className="font-medium text-foreground">{DOW_FULL[data[best]!.weekday]}s</span>.
          </>
        ) : (
          'Not enough history yet — keep going.'
        )}
      </p>
    </div>
  )
}
