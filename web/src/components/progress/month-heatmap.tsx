import { toDegrees, type MonthDay, type MonthProgress } from '#/lib/progress'
import { cn } from '#/lib/utils'
import { MoonDisc, MoonGradients } from './moon-disc'

function cellLabel(d: MonthDay, monthName: string): string {
  const white = d.day >= 13 && d.day <= 15 ? ' · White Day' : ''
  const tag = d.state === 'today' ? ' · today' : d.state === 'future' ? ' · upcoming' : ''
  return `${monthName} ${d.day} · ${toDegrees(d.fraction)}°${tag}${white}`
}

/**
 * The current Hijri month as a grid of moons — one per day, drawn at that day's true phase and lit
 * to how complete the day was (bright = kept, dark = missed). Today is ringed; the White Days
 * (13–15) carry a hairline ring; upcoming days are dimmed. The moon's brightness is the single
 * completion encoding, so it never relies on colour alone.
 */
export function MonthHeatmap({ month }: { month: MonthProgress }) {
  return (
    <div>
      <MoonGradients />
      <div className="grid grid-cols-10 gap-2 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
        {month.days.map((d) => {
          const isWhite = d.day >= 13 && d.day <= 15
          const litOpacity = d.state === 'future' ? 0.1 : 0.15 + 0.85 * d.fraction
          return (
            <div
              key={d.day}
              title={cellLabel(d, month.monthName)}
              aria-label={cellLabel(d, month.monthName)}
              className={cn(
                'relative aspect-square rounded-md p-1',
                d.state === 'future' && 'opacity-45',
                d.state === 'today' && 'ring-1 ring-signal',
                isWhite && d.state !== 'today' && 'ring-1 ring-[var(--hairline-2)]',
              )}
            >
              <MoonDisc dayOfMonth={d.day} monthLength={month.monthLength} litOpacity={litOpacity} />
              <span className="absolute right-1 top-0.5 font-mono text-[9px] tabular-nums text-muted-foreground/40">
                {d.day}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Missed</span>
        {[0.18, 0.45, 0.72, 1].map((o) => (
          <span key={o} className="inline-block size-4">
            <MoonDisc dayOfMonth={15} monthLength={month.monthLength} litOpacity={o} />
          </span>
        ))}
        <span>Kept</span>
      </div>
    </div>
  )
}
