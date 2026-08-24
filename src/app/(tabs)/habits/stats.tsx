import { useLocalSearchParams } from 'expo-router';

import { AppScreen } from '@/components/app-screen';
import { StatsSkeleton } from '@/components/progress-skeleton';
import { StatsScreen } from '@/components/stats-screen';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabitStats } from '@/hooks/use-habit-stats';
import { useHabits } from '@/hooks/use-habits';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { describeHijriSchedule } from '@/lib/dates';

/**
 * A single act's or exchange's "Stats" — the per-habit sibling of the Progress tab, reached from
 * its options sheet (`act-actions` → Stats). Params-driven like the editor (`habitId`); the
 * habit definition comes from the in-memory Habits list, only its history is fetched. The cards
 * themselves live in {@link StatsScreen}, shared with a stack's Stats.
 */
export default function HabitStatsScreen() {
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { loading, error, dismissError, refresh, habit, stats } = useHabitStats(habitId ?? '');
  const { loading: habitsLoading } = useHabits();
  const { refreshControl } = usePullToRefresh(refresh);

  // Opened for a habit that no longer exists (deleted elsewhere / stale link) — back out rather
  // than render an empty shell (the editor's guard). `habit` comes from the habits list, which is
  // empty while ITS first load runs (a cold start whose snapshot seed was rejected) — that load
  // must have settled too, or this pops the screen for a habit that exists.
  useBackIfStale(!loading && !habitsLoading && !habit);

  if (loading || (habitsLoading && !habit)) {
    return (
      <AppScreen transparent>
        <StatsSkeleton />
      </AppScreen>
    );
  }
  if (!habit || !stats) return null;

  const hijriNote =
    !stats.weekdayApplicable && habit.hijri_schedule ? describeHijriSchedule(habit.hijri_schedule) : undefined;

  return (
    <StatsScreen
      title={habit.name}
      stats={stats}
      hijriNote={hijriNote}
      emptyBody="Complete it a few times to see its pattern — best day, streak, trend."
      error={error}
      onDismissError={dismissError}
      refreshControl={refreshControl}
    />
  );
}
