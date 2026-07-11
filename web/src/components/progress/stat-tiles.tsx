import { Panel } from '#/components/console'
import { toDegrees } from '#/lib/progress'

function Tile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <Panel className="p-5">
      <div className="metric-label">{label}</div>
      <div className="display-title mt-3 text-[2rem] leading-none text-foreground tabular-nums">{value}</div>
      <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
    </Panel>
  )
}

/** Four quiet HUD readouts under the hero — the numbers you'd glance at first. */
export function StatTiles({
  streak,
  rate30,
  habitsCount,
  bestDay,
  monthName,
}: {
  streak: number
  /** 30-day completion rate, 0–1 (shown in degrees). */
  rate30: number
  habitsCount: number
  bestDay: { day: number; fraction: number } | null
  monthName: string
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile label="Current streak" value={streak} sub={streak === 1 ? 'day kept' : 'days kept'} />
      <Tile label="Last 30 days" value={`${toDegrees(rate30)}°`} sub="of a full orbit" />
      <Tile label="Habits" value={habitsCount} sub="tracked" />
      <Tile
        label="Best day"
        value={bestDay ? `${toDegrees(bestDay.fraction)}°` : '—'}
        sub={bestDay ? `${monthName} ${bestDay.day}` : 'this month'}
      />
    </div>
  )
}
