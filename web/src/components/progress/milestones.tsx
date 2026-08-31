import { cn } from '#/lib/utils'

/**
 * "Records": the three numbers a habit-keeper actually brags about — longest run kept, perfect days,
 * total acts. Rendered as a vertical readout stack (label + context left, big figure right, hairline
 * between) rather than another card grid, so it reads differently from the KPI tiles above it.
 */
export function Milestones({
  longestStreak,
  perfectDays,
  totalActs,
}: {
  longestStreak: number
  perfectDays: number
  totalActs: number
}) {
  const rows = [
    { label: 'Longest streak', sub: 'days kept in a row', value: longestStreak },
    { label: 'Perfect days', sub: 'every act complete', value: perfectDays },
    { label: 'Completed', sub: 'acts this year', value: totalActs },
  ]
  return (
    <div className="grid">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={cn('flex items-center justify-between gap-4 py-4', i > 0 && 'border-t border-border')}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{r.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{r.sub}</div>
          </div>
          <div className="shrink-0 text-3xl font-semibold leading-none text-foreground tabular-nums">
            {r.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  )
}
