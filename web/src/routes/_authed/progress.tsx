import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, PageHeader, Panel, Section } from '#/components/console'
import { HabitBreakdown } from '#/components/progress/habit-breakdown'
import { MonthHeatmap } from '#/components/progress/month-heatmap'
import { OrbitGauge } from '#/components/progress/orbit-gauge'
import { ProgressSkeleton } from '#/components/progress/progress-skeleton'
import { StatTiles } from '#/components/progress/stat-tiles'
import { YearTrend } from '#/components/progress/year-trend'
import { todayLocalISO } from '#/lib/dates'
import {
  bestDayThisMonth,
  computeHabitStats,
  computeProgress,
  computeStreak,
  progressQueryOptions,
  rollingRate,
} from '#/lib/progress'

export const Route = createFileRoute('/_authed/progress')({ component: ProgressPage })

/** The window for the 30-day rate and the per-habit sparklines. */
const HABIT_WINDOW = 30

function ProgressPage() {
  const { data, isPending, isError } = useQuery(progressQueryOptions())
  // The date is derived from the viewer's clock, so it's resolved after mount — otherwise the SSR
  // date and the client date disagree across midnight and React throws a hydration mismatch.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayLocalISO()), [])

  const derived = useMemo(() => {
    if (!data || !today) return null
    const progress = computeProgress(data.habits, data.completions, today)
    return {
      progress,
      streak: computeStreak(data.habits, data.completions, today),
      rate30: rollingRate(data.habits, data.completions, today, HABIT_WINDOW),
      best: bestDayThisMonth(progress.month),
      habitStats: computeHabitStats(data.habits, data.completions, today, HABIT_WINDOW),
    }
  }, [data, today])

  const header = <PageHeader title="Progress" readout={today ? `Your orbit, as of ${today}` : 'Your orbit'} />

  if (!today || isPending)
    return (
      <div>
        {header}
        <ProgressSkeleton />
      </div>
    )

  if (isError || !derived)
    return (
      <div>
        {header}
        <EmptyState title="Couldn’t load your progress">Try refreshing the page in a moment.</EmptyState>
      </div>
    )

  const { progress, streak, rate30, best, habitStats } = derived

  if (progress.habitsCount === 0)
    return (
      <div>
        {header}
        <EmptyState title="Your moons will rise here">
          Track a habit in the Qamar app and your completions will chart here — month by month, in orbit degrees.
        </EmptyState>
      </div>
    )

  if (!progress.month || !progress.year)
    return (
      <div>
        {header}
        <EmptyState title="Lunar calendar unavailable">
          This browser can’t resolve the Umm al-Qura calendar, so the orbit charts can’t be drawn.
        </EmptyState>
      </div>
    )

  return (
    <div>
      {header}
      <div className="grid grid-cols-12 gap-4">
        <Panel framed className="rise-in col-span-12 p-5 lg:col-span-5">
          <Section title="This month">
            <div className="flex justify-center py-2">
              <OrbitGauge month={progress.month} />
            </div>
          </Section>
        </Panel>

        <Panel className="rise-in col-span-12 p-4 lg:col-span-7 [--rise-delay:80ms]">
          <Section title="This year">
            <YearTrend year={progress.year} />
          </Section>
        </Panel>

        <div className="rise-in col-span-12 [--rise-delay:160ms]">
          <StatTiles
            streak={streak}
            rate30={rate30}
            habitsCount={progress.habitsCount}
            bestDay={best}
            monthName={progress.month.monthName}
          />
        </div>

        <Panel className="rise-in col-span-12 p-4 [--rise-delay:240ms]">
          <Section title={`${progress.month.monthName} · day by day`}>
            <MonthHeatmap month={progress.month} />
          </Section>
        </Panel>

        <Panel className="rise-in col-span-12 p-4 [--rise-delay:320ms]">
          <Section title="By habit" count={habitStats.length}>
            <HabitBreakdown stats={habitStats} />
          </Section>
        </Panel>
      </div>
    </div>
  )
}
