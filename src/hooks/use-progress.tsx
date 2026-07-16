import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import type { Habit } from '@/hooks/use-habits';
import { addDaysISO, todayLocalISO } from '@/lib/dates';
import { computeProgress, withDoneToday, type CompletionRow, type MonthProgress, type ProgressDerived, type YearProgress } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

// The progress math lives in `@/lib/progress` (pure, no React/Supabase — unit-testable).
// Re-export its public types so existing screen components keep importing them from this hook.
export type { MonthDay, MonthProgress, YearProgress } from '@/lib/progress';

/**
 * How far back we pull completions — covers this Hijri year so far. The query
 * returns only rows that exist, so the payload scales with real usage, not the window.
 */
const WINDOW_DAYS = 370;

/** Pull the raw {@link WINDOW_DAYS}-day window of habits + completions for a user. Shared by the
 *  focus-driven hook and the one-shot {@link loadProgress} (the day-complete celebration fetches
 *  outside the navigator, where `useFocusEffect` can't run). Throws on a query error. */
async function fetchProgressWindow(userId: string, today: string): Promise<{ habits: Habit[]; completions: CompletionRow[] }> {
  const since = addDaysISO(today, -(WINDOW_DAYS - 1));
  const [habitsRes, completionsRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', userId).order('position', { ascending: true }),
    supabase
      .from('habit_completions')
      .select('habit_id, completed_at, status, count')
      .eq('user_id', userId)
      .gte('completed_at', since),
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
export async function loadProgress(userId: string, today: string, doneToday: string[] = []): Promise<ProgressDerived> {
  const { habits, completions } = await fetchProgressWindow(userId, today);
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
  /** This Hijri year as 12 months — the year bars, or `null` if unavailable. */
  year: YearProgress | null;
};

/**
 * Read-only view of the user's recent habit history. Independent of
 * `HabitsProvider` (which lives only on the Habits tab and loads today alone):
 * this pulls a {@link WINDOW_DAYS}-day window and refetches whenever the Progress
 * tab regains focus, so ticks made elsewhere show up on return.
 */
export function useProgress(): ProgressData {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<string>(() => todayLocalISO());

  const todayRef = useRef(today);
  useEffect(() => {
    todayRef.current = today;
  }, [today]);

  // Concurrent callers (the mount preload, a focus refetch, pull-to-refresh) share one request:
  // each fetch is two queries plus a whole-year recompute on landing, so overlapping identical
  // pulls are pure waste — the one already in flight is milliseconds old and just as fresh.
  const inFlight = useRef<Promise<void> | null>(null);
  const fetchData = useCallback(async () => {
    if (!userId) return;
    if (inFlight.current) return inFlight.current;
    const day = todayLocalISO();
    const work = (async () => {
      try {
        const { habits: rows, completions: comps } = await fetchProgressWindow(userId, day);
        setToday(day);
        setHabits(rows);
        setCompletions(comps);
        setError(null);
      } catch {
        setError('Could not load your progress. Pull down to try again.');
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = work;
    return work;
  }, [userId]);

  // Preload on mount. Under NativeTabs every tab screen is mounted eagerly (all tabs
  // pre-render and never unmount), so this fetch runs in the background the moment the user
  // enters the tabs — while they're still on Habits. By the time they open Progress the data
  // (and its one-time entrance animation) is already settled, so the screen pops with content
  // instead of a skeleton. https://docs.expo.dev/router/advanced/native-tabs/
  useEffect(() => {
    let active = true;
    void (async () => {
      await fetchData();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchData]);

  // Refetch on focus so ticks made on the Habits tab appear on return. Silent — the mount
  // preload owns the one-time loading gate, so this never re-shows the skeleton.
  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData]),
  );

  // Day rollover while the tab stays focused in the background (focus won't fire).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !userId) return;
      if (todayLocalISO() !== todayRef.current) void fetchData();
    });
    return () => sub.remove();
  }, [userId, fetchData]);

  const dismissError = useCallback(() => setError(null), []);

  const derived = useMemo(() => computeProgress(habits, completions, today), [habits, completions, today]);

  return { loading, error, dismissError, refresh: fetchData, ...derived };
}
