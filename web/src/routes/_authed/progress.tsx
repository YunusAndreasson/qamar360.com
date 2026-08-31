import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, PageHeader } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { FirstYear } from '#/components/progress/first-year'
import { HabitBreakdown } from '#/components/progress/habit-breakdown'
import { Milestones } from '#/components/progress/milestones'
import { MonthHeatmap } from '#/components/progress/month-heatmap'
import { OrbitGauge } from '#/components/progress/orbit-gauge'
import { ProgressSkeleton } from '#/components/progress/progress-skeleton'
import { StatTiles } from '#/components/progress/stat-tiles'
import { WeekdayBars } from '#/components/progress/weekday-bars'
import { YearTrend } from '#/components/progress/year-trend'
import { formatGregorian, formatHijriDate, todayLocalISO } from '#/lib/dates'
import {
  bestDayThisMonth,
  computeHabitStats,
  computeProgress,
  computeStreak,
  milestoneStats,
  progressQueryOptions,
  rollingRate,
  weekdayRates,
} from '#/lib/progress'

export const Route = createFileRoute('/_authed/progress')({ component: ProgressPage })

/** The window for the 30-day rate and the per-habit sparklines. */
const HABIT_WINDOW = 30
/** The window for the weekday bars and the "Records" — this Hijri year's worth of data. */
const YEAR_WINDOW = 365

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
      weekday: weekdayRates(data.habits, data.completions, today, YEAR_WINDOW),
      milestones: milestoneStats(data.habits, data.completions, today, YEAR_WINDOW),
    }
  }, [data, today])

  // The lunar date, not a raw ISO string — it ties the header to the orbit gauge below.
  const readout = today ? (formatHijriDate(today) ?? formatGregorian(today)) : undefined
  const header = <PageHeader title="Progress" readout={readout} />

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

  const { progress, streak, rate30, best, habitStats, weekday, milestones } = derived

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

  // The trend only reads as a trend once a couple of months have elapsed; before that a single point
  // in an empty chart looks broken, so the same panel shows the "just beginning" state instead.
  const elapsedMonths = progress.year.months.filter((m) => m.state !== 'future').length
  const showYearTrend = elapsedMonths >= 2

  return (
    <div>
      {header}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader>
            <CardTitle>This month</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center pb-2">
            <OrbitGauge month={progress.month} />
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader>
            <CardTitle>This year</CardTitle>
          </CardHeader>
          <CardContent>
            {showYearTrend ? <YearTrend year={progress.year} /> : <FirstYear year={progress.year} />}
          </CardContent>
        </Card>

        <div className="col-span-12">
          <StatTiles
            streak={streak}
            rate30={rate30}
            habitsCount={progress.habitsCount}
            bestDay={best}
            monthName={progress.month.monthName}
          />
        </div>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader>
            <CardTitle>Best day of week</CardTitle>
          </CardHeader>
          <CardContent>
            <WeekdayBars rates={weekday} />
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-5">
          <CardHeader>
            <CardTitle>Records</CardTitle>
          </CardHeader>
          <CardContent>
            <Milestones
              longestStreak={milestones.longestStreak}
              perfectDays={milestones.perfectDays}
              totalActs={milestones.totalActs}
            />
          </CardContent>
        </Card>

        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>{progress.month.monthName} · day by day</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthHeatmap month={progress.month} />
          </CardContent>
        </Card>

        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>By habit</CardTitle>
            <CardAction>
              <Badge variant="secondary">{habitStats.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <HabitBreakdown stats={habitStats} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
