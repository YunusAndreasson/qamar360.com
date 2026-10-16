import { Stack, useLocalSearchParams } from 'expo-router';

import { AppScreen } from '@/components/app-screen';
import { StatsSkeleton } from '@/components/progress-skeleton';
import { StatsScreen } from '@/components/stats-screen';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabits } from '@/hooks/use-habits';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useStackStats } from '@/hooks/use-stack-stats';
import { describeHijriSchedule } from '@/lib/dates';

/**
 * A stack's "Stats" — the sibling of `stats.tsx`, reached from the stack's options sheet
 * (`stack-manage` → Stats) and rendered by the same {@link StatsScreen}.
 *
 * What it measures is the *seal*: a day counts when the whole sequence held, which is the only
 * reading consistent with a stack being one performance (see `computeStackStats`). So the ring, the
 * streak and the trend here answer "how often does this routine actually happen", not "how many of
 * its acts do I get through" — a question the per-act Stats already answers, one act at a time.
 */
export default function StackStatsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { loading, error, dismissError, refresh, stack, members, stats } = useStackStats(id ?? '');
  const { loading: habitsLoading } = useHabits();
  const { refreshControl } = usePullToRefresh(refresh);

  // Opened for a stack that no longer exists (deleted elsewhere / stale link) — back out rather
  // than render an empty shell. The stack comes from the habits list, which is empty while ITS
  // first load runs, so that load must have settled too (the same guard `stats.tsx` carries).
  useBackIfStale(!loading && !habitsLoading && !stack);

  if (loading || (habitsLoading && !stack)) {
    // Named from the first frame: the stack is already in memory, only its history is loading, and
    // a title left unset showed the route's own name ("stack-stats") until it landed.
    return (
      <>
        <Stack.Screen options={{ title: stack?.name ?? '' }} />
        <AppScreen transparent>
          <StatsSkeleton />
        </AppScreen>
      </>
    );
  }
  if (!stack || !stats) return null;

  // Every act is Hijri-scheduled, so a weekday split can't mean anything. Name the schedules
  // instead — uniqued, since a stack's acts usually share one.
  const hijriNote = stats.weekdayApplicable
    ? undefined
    : [...new Set(members.map((m) => (m.hijri_schedule ? describeHijriSchedule(m.hijri_schedule) : null)))]
        .filter((note) => note !== null)
        .join(' · ') || undefined;

  return (
    <StatsScreen
      title={stack.name}
      stats={stats}
      hijriNote={hijriNote}
      emptyBody="Seal it a few times to see its pattern: best day, streak, trend."
      error={error}
      onDismissError={dismissError}
      refreshControl={refreshControl}
    />
  );
}
