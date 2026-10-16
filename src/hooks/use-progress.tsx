import { useCallback, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useGoals } from '@/hooks/use-goals';
import type { Habit } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { todayLocalISO } from '@/lib/dates';
import { computeGoals, type GoalReading } from '@/lib/goals';
import { fetchProgressWindow } from '@/lib/load-progress';
import { computeProgress, type CompletionRow, type MonthProgress, type RecordSeries, type SeriesPeriod, type TrendSummary } from '@/lib/progress';

// The progress math lives in `@/lib/progress` (pure, no React/Supabase — unit-testable).
// Re-export its public types so existing screen components keep importing them from this hook.
export type { MonthProgress, RecordSeries, SeriesPeriod, SeriesPoint, TrendSummary } from '@/lib/progress';

type ProgressData = {
  /** True only during the first load. */
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  /** Re-pull the window (pull-to-refresh). Silent — owns no spinner of its own. */
  refresh: () => Promise<void>;
  habitsCount: number;
  /** This Hijri month's completion so far — the moon ring, or `null` if unavailable. */
  month: MonthProgress | null;
  /** The rising-months statement for the Over-time card, or `null` if the calendar is unavailable. */
  trend: TrendSummary | null;
  /** The record read over each period — what the chart's selector switches between. `life` is the
   *  whole of it, and the only reading that moves on a second day of use. */
  seriesByPeriod: Record<SeriesPeriod, RecordSeries>;
  /** The periods worth offering, narrowest first. `length === 1` means no selector. */
  seriesPeriods: SeriesPeriod[];
  /**
   * Every goal, read against this same record. Derived here rather than in `computeProgress`
   * because a goal is stored — it needs `useGoals` — while `computeProgress` is a pure function
   * of habits and completions, and {@link loadProgress} calls it from outside the navigator
   * where no provider is mounted.
   */
  goals: GoalReading[];
  /** The local day these figures describe. Owned here because it survives a midnight rollover,
   *  which a `todayLocalISO()` call in a screen's render would not. */
  today: string;
};

/**
 * Read-only view of the user's whole habit history. Independent of `HabitsProvider` (which lives
 * only on the Habits tab and loads today alone): this pulls every completion on record — "This
 * life" is measured in Hijri years, so a window would cut the record off — and refetches whenever
 * the Progress tab regains focus, so ticks made elsewhere show up on return.
 */
export function useProgress(): ProgressData {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { goals: goalRows, goalActs, checkIns } = useGoals();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<string>(() => todayLocalISO());

  const todayRef = useLatestRef(today);

  // The user this hook instance currently serves — a fetch that lands after a user switch must
  // neither be reused nor write its rows.
  const userRef = useLatestRef(userId);

  // Concurrent callers (the mount preload, a focus refetch, pull-to-refresh) share one request:
  // each fetch is two queries plus a whole-year recompute on landing, so overlapping identical
  // pulls are pure waste — the one already in flight is milliseconds old and just as fresh.
  // Keyed by user so a request for a *previous* user is never handed to the new one.
  const inFlight = useRef<{ key: string; work: Promise<void> } | null>(null);
  const fetchData = useCallback(async () => {
    if (!userId) return;
    if (inFlight.current?.key === userId) return inFlight.current.work;
    const day = todayLocalISO();
    const work = (async () => {
      try {
        const { habits: rows, completions: comps } = await fetchProgressWindow(userId, day);
        if (userRef.current !== userId) return; // superseded mid-flight — discard
        setToday(day);
        setHabits(rows);
        setCompletions(comps);
        setError(null);
      } catch {
        if (userRef.current !== userId) return;
        setError('Could not load your progress. Pull down to try again.');
      } finally {
        if (inFlight.current?.key === userId) inFlight.current = null;
      }
    })();
    inFlight.current = { key: userId, work };
    return work;
  }, [userId, userRef]);

  useRefreshLifecycle(userId, fetchData, todayRef, setLoading);

  const dismissError = useCallback(() => setError(null), []);

  const derived = useMemo(() => computeProgress(habits, completions, today), [habits, completions, today]);

  // The goals ride on the same fetch. `computeGoals` walks only the rows of acts some goal
  // actually drives, so a user with none pays for one `Set` and nothing else.
  const goals = useMemo(
    () => computeGoals(goalRows, goalActs, habits, completions, checkIns, today),
    [goalRows, goalActs, habits, completions, checkIns, today],
  );

  return { loading, error, dismissError, refresh: fetchData, today, goals, ...derived };
}
