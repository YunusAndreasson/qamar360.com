import { Card, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { toDegrees } from '#/lib/progress'

function Tile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <Card className="gap-0 py-5">
      <CardHeader className="gap-1 px-5">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardHeader>
    </Card>
  )
}

/** The four numbers you'd glance at first, under the hero. */
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
