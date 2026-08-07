import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { HabitStatsHero } from '@/components/habit-stats-hero';
import { HabitStreakCard } from '@/components/habit-streak-card';
import { HabitTrendChart } from '@/components/habit-trend-chart';
import { HabitWeekdayBars } from '@/components/habit-weekday-bars';
import { InsightsSkeleton } from '@/components/progress-skeleton';
import { useHabitStats } from '@/hooks/use-habit-stats';
import { useHabits } from '@/hooks/use-habits';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { describeHijriSchedule } from '@/lib/dates';

/**
 * A single habit's "Insights" — the per-habit sibling of the Progress tab, reached by swiping a
 * habit row (leading swipe → Insights). Params-driven like the editor (`habitId`); the habit
 * definition comes from the in-memory Habits list, only its history is fetched. Presented as a
 * pushed transparent screen so the fixed sky shows behind the cards, exactly like Progress.
 */
export default function HabitStatsScreen() {
  const router = useRouter();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { loading, error, dismissError, refresh, habit, stats } = useHabitStats(habitId ?? '');
  const { loading: habitsLoading } = useHabits();
  const { refreshControl } = usePullToRefresh(refresh);

  // Opened for a habit that no longer exists (deleted elsewhere / stale link) — back out rather
  // than render an empty shell (the editor's guard). `habit` comes from the habits list, which is
  // empty while ITS first load runs (a cold start whose snapshot seed was rejected) — that load
  // must have settled too, or this pops the screen for a habit that exists.
  useEffect(() => {
    if (!loading && !habitsLoading && !habit) router.back();
  }, [loading, habitsLoading, habit, router]);

  if (loading || (habitsLoading && !habit)) {
    return (
      <AppScreen transparent>
        <InsightsSkeleton />
      </AppScreen>
    );
  }
  if (!habit || !stats) return null;

  const hijriNote =
    !stats.weekdayApplicable && habit.hijri_schedule ? describeHijriSchedule(habit.hijri_schedule) : undefined;

  return (
    <>
      {/* A compact title carrying the habit's name — the pushed-detail voice, not a tab's large title. */}
      <Stack.Screen options={{ title: habit.name }} />

      {stats.scheduledDays === 0 ? (
        <AppScreen transparent centered refreshControl={refreshControl}>
          <EmptyState
            icon="insights"
            title="No rhythm yet"
            body="Complete this a few times and its pattern — best day, streak, and trend — will appear here."
          />
        </AppScreen>
      ) : (
        <AppScreen transparent refreshControl={refreshControl}>
          <ErrorBanner message={error} onDismiss={dismissError} />

          <HabitStatsHero consistency={stats.consistency} trend={stats.trend} scheduledDays={stats.scheduledDays} />

          <HabitWeekdayBars
            byWeekday={stats.byWeekday}
            bestWeekday={stats.bestWeekday}
            toughestWeekday={stats.toughestWeekday}
            hijriNote={hijriNote}
          />

          <HabitStreakCard currentStreak={stats.currentStreak} longestStreak={stats.longestStreak} />

          <HabitTrendChart trend={stats.trend} />
        </AppScreen>
      )}
    </>
  );
}
