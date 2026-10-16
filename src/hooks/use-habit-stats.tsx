import { useCallback, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useHabits, type Habit } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { addDaysISO, todayLocalISO } from '@/lib/dates';
import { computeHabitStats, STATS_WINDOW_DAYS, type HabitStats } from '@/lib/habit-stats';
import type { CompletionRow } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

// Re-export the chart-facing stat types so component code imports them from the hook (mirrors
// `use-progress`). `HabitStats` itself stays internal — callers read the fields off the hook.
export type { TrendPoint, WeekdayStat } from '@/lib/habit-stats';

/** Pull one habit's completion history over the stats window. Only rows that exist are returned,
 *  so the payload scales with real usage, not the window. Throws on a query error. */
async function fetchHabitCompletions(userId: string, habitId: string, today: string): Promise<CompletionRow[]> {
  const since = addDaysISO(today, -(STATS_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from('habit_completions')
    .select('habit_id, completed_at, status, count')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .gte('completed_at', since);
  if (error) throw error;
  return data ?? [];
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

  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [today, setToday] = useState<string>(() => todayLocalISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The identity this hook instance currently serves — a fetch that lands after the identity
  // moved on (user switch, habit param change) must neither be reused nor write its rows.
  const identity = `${userId}:${habitId}`;
  const identityRef = useLatestRef(identity);
  const todayRef = useLatestRef(today);

  // Concurrent callers (mount preload, a focus refetch, pull-to-refresh) share one request — the
  // one already in flight is milliseconds old and just as fresh. Keyed by identity so a request
  // for a *previous* habit/user is never handed to the new one.
  const inFlight = useRef<{ key: string; work: Promise<void> } | null>(null);
  const fetchData = useCallback(async () => {
    if (!userId) return;
    const key = `${userId}:${habitId}`;
    if (inFlight.current?.key === key) return inFlight.current.work;
    const day = todayLocalISO();
    const work = (async () => {
      try {
        const rows = await fetchHabitCompletions(userId, habitId, day);
        if (identityRef.current !== key) return; // superseded mid-flight — discard
        setToday(day);
        setCompletions(rows);
        setError(null);
      } catch {
        if (identityRef.current !== key) return;
        setError("Could not load these stats. Pull down to try again.");
      } finally {
        if (inFlight.current?.key === key) inFlight.current = null;
      }
    })();
    inFlight.current = { key, work };
    return work;
  }, [userId, habitId, identityRef]);

  useRefreshLifecycle(userId, fetchData, todayRef, setLoading);

  const dismissError = useCallback(() => setError(null), []);

  const stats = useMemo(() => (habit ? computeHabitStats(habit, completions, today) : null), [habit, completions, today]);

  return { loading, error, dismissError, refresh: fetchData, habit, stats };
}
