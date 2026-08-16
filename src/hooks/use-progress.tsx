import { useCallback, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import type { Habit } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { addDaysISO, todayLocalISO } from '@/lib/dates';
import { computeProgress, withDoneToday, type CompletionRow, type MonthProgress, type ProgressDerived, type RecordSeries, type SeriesPeriod, type TrendSummary } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

// The progress math lives in `@/lib/progress` (pure, no React/Supabase — unit-testable).
// Re-export its public types so existing screen components keep importing them from this hook.
export type { MonthProgress, RecordSeries, SeriesPeriod, SeriesPoint, TrendSummary } from '@/lib/progress';

/**
 * How far back the day-complete overlay pulls completions — a Hijri year covers everything its
 * card reads (this month, last month, the year's months). The query returns only rows that exist,
 * so the payload scales with real usage, not the window.
 *
 * The Progress *tab* passes no window at all: "This life" is every Hijri year on record, and a
 * year-long window would silently cut the record off at its edge. All-time is a bounded amount of
 * data — one row per habit per day actually kept — and the tab fetches it once per focus.
 */
const OVERLAY_WINDOW_DAYS = 370;

/** Pull habits + completions for a user, optionally limited to the last `windowDays`. Shared by
 *  the focus-driven hook (all time) and the one-shot {@link loadProgress} (windowed — the
 *  day-complete celebration fetches outside the navigator, where `useFocusEffect` can't run).
 *  Throws on a query error. */
async function fetchProgressWindow(
  userId: string,
  today: string,
  windowDays?: number,
): Promise<{ habits: Habit[]; completions: CompletionRow[] }> {
  const completionsQuery = supabase
    .from('habit_completions')
    .select('habit_id, completed_at, status, count')
    .eq('user_id', userId);
  const [habitsRes, completionsRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', userId).order('position', { ascending: true }),
    windowDays === undefined
      ? completionsQuery
      : completionsQuery.gte('completed_at', addDaysISO(today, -(windowDays - 1))),
  ]);
  if (habitsRes.error) throw habitsRes.error;
  if (completionsRes.error) throw completionsRes.error;
  return { habits: (habitsRes.data ?? []) as Habit[], completions: completionsRes.data ?? [] };
}

/** One-shot progress read (fetch + pure {@link computeProgress}) for callers outside the Progress
 *  tab — the day-complete overlay. Same window and math as {@link useProgress}. `doneToday` are the
 *  ids the overlay already knows are done for `today` (it only fires once the day is complete) —
 *  overlaid via {@link withDoneToday} so the overlay's degrees don't undercount ticks that haven't
 *  yet reached the server, and so match the Progress tab. */
export async function loadProgress(userId: string, today: string, doneToday: string[]): Promise<ProgressDerived> {
  const { habits, completions } = await fetchProgressWindow(userId, today, OVERLAY_WINDOW_DAYS);
  return computeProgress(habits, withDoneToday(completions, doneToday, today), today);
}

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
        setError('Couldn’t load your progress. Pull down to try again.');
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

  return { loading, error, dismissError, refresh: fetchData, ...derived };
}
