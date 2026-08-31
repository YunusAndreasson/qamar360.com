import type { YearProgress } from '#/lib/progress'
import { cn } from '#/lib/utils'

/**
 * Stand-in for the year trend before it can mean anything. A young Hijri year has too few elapsed
 * months to read as a line — one lonely dot in an empty panel looks broken — so instead we show
 * where the year stands: the same 1–12 month axis the chart will grow into (current month lit),
 * under a quiet word that the year is just beginning. Occupies the trend's slot so the two-column
 * layout stays intact.
 */
export function FirstYear({ year }: { year: YearProgress }) {
  const current = year.months.find((m) => m.state === 'current')

  return (
    <div className="flex h-[240px] flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <div className="text-xl font-semibold tracking-tight text-foreground">{year.year} is just beginning</div>
        <p className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
          Each Hijri month charts here as it passes — you’re in {current?.monthName ?? '—'}, month{' '}
          {current?.month ?? 1} of 12.
        </p>
      </div>

      {/* the chart's own x-axis, drawn empty — the panel the trend will grow into */}
      <div className="flex items-end justify-between border-t px-1 pt-2">
        {year.months.map((m) => (
          <span
            key={m.month}
            title={m.monthName}
            className={cn(
              'text-[11px] tabular-nums',
              m.state === 'current'
                ? 'font-medium text-foreground'
                : m.state === 'past'
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/40',
            )}
          >
            {m.month}
          </span>
        ))}
      </div>
    </div>
  )
}
