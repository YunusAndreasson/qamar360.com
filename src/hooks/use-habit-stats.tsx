import { useCallback, useMemo } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useHabits, type Habit } from '@/hooks/use-habits';
import { useHistoryRead } from '@/hooks/use-history-read';
import { fetchCompletionRows } from '@/lib/completion-reads';
import { addDaysISO } from '@/lib/dates';
import { computeHabitStats, STATS_WINDOW_DAYS, type HabitStats } from '@/lib/habit-stats';
import type { CompletionRow } from '@/lib/progress';

// Re-export the chart-facing stat types so component code imports them from the hook (mirrors
// `use-progress`). `HabitStats` itself stays internal — callers read the fields off the hook.
export type { TrendPoint, WeekdayStat } from '@/lib/habit-stats';

/** Pull one habit's completion history over the stats window. Only rows that exist are returned,
 *  so the payload scales with real usage, not the window. Throws on a query error. */
async function fetchHabitCompletions(userId: string, habitId: string, today: string): Promise<CompletionRow[]> {
  const since = addDaysISO(today, -(STATS_WINDOW_DAYS - 1));
  return fetchCompletionRows(userId, (query) => query.eq('habit_id', habitId).gte('completed_at', since));
}

type HabitStatsData = {
  /** True only during the first load. */
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  /** Re-pull this habit's window (pull-to-refresh). Silent — owns no spinner of its own. */
  refresh: () => Promise<void>;
  /** The habit definition (from the in-memory Habits list), or `null` if it's gone. */
  habit: Habit | null;
  /** The derived stats, or `null` until the habit resolves. */
  stats: HabitStats | null;
};

/**
 * Read-only per-habit stats for the Stats screen. The habit *definition* comes from
 * `useHabits()` (already in memory — the Stats screen is a descendant of `HabitsProvider`), so
 * only this habit's completion history is fetched here. Refetches whenever the screen regains
 * focus, so ticks made on Today show up on return. The single-habit sibling of {@link useProgress}.
 */
export function useHabitStats(habitId: string): HabitStatsData {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { habits } = useHabits();
  const habit = useMemo(() => habits.find((h) => h.id === habitId) ?? null, [habits, habitId]);

  const load = useCallback((userId: string, today: string) => fetchHabitCompletions(userId, habitId, today), [habitId]);
  const { data: completions, today, ...read } = useHistoryRead<CompletionRow[]>(
    userId,
    `${userId}:${habitId}`,
    load,
    [],
    'Could not load these stats. Pull down to try again.',
  );

  const stats = useMemo(() => (habit ? computeHabitStats(habit, completions, today) : null), [habit, completions, today]);

  return { ...read, habit, stats };
}
