import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import type { Habit } from '@/hooks/use-habits';
import type { Tables } from '@/lib/database.types';
import { addDaysISO, lastNDaysISO, todayLocalISO } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

/** How far back we pull completions — covers the weekly view and the streak walk. */
const WINDOW_DAYS = 90;
/** Days shown in the weekly bar chart and per-habit dot trail. */
const WEEK_DAYS = 7;

/** One day in a habit's recent history. */
export type DayCell = 'done' | 'missed' | 'inactive';

/** A single day's completion in the weekly bar chart. */
export type WeekDay = {
  iso: string;
  completed: number;
  possible: number;
  /** completed / possible, in [0, 1]; 0 when no habits were active that day. */
  fraction: number;
  isToday: boolean;
};

/** A habit's last-7-days consistency. */
export type HabitProgress = {
  id: string;
  name: string;
  /** 7 cells, oldest → today. */
  cells: DayCell[];
  /** Days completed within the window. */
  doneCount: number;
  /** Days the habit existed within the window (1–7) — the denominator for `doneCount`. */
  activeDays: number;
};

export type ProgressData = {
  /** True only during the first load. */
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  habitsCount: number;
  week: WeekDay[];
  totals: { completed: number; possible: number; percent: number };
  /** Per-habit last-7-days consistency, in the same order as the Habits tab. */
  perHabit: HabitProgress[];
  /** Consecutive "perfect" days (all active habits done) ending today/yesterday. */
  streak: number;
  /** True when the streak reached the `WINDOW_DAYS` edge still unbroken (so it may be longer). */
  streakCapped: boolean;
};

type CompletionRow = Pick<Tables<'habit_completions'>, 'habit_id' | 'completed_at'>;

/** A habit's creation day as a local `YYYY-MM-DD`, or null when unknown (treated as always-active). */
function createdLocalISO(habit: Habit): string | null {
  return habit.created_at ? todayLocalISO(new Date(habit.created_at)) : null;
}

/**
 * A habit is "active" on day `D` once it has been created (or if its creation
 * date is unknown). Keeping past days out before a habit existed is what stops a
 * newly-added habit from retroactively breaking streaks and percentages.
 * `YYYY-MM-DD` strings compare correctly with `<=`.
 */
function activeOn(created: string | null, dayISO: string): boolean {
  return created == null || created <= dayISO;
}

/** Derive every progress metric from the raw rows. Pure — easy to reason about and test. */
function computeProgress(
  habits: Habit[],
  completions: CompletionRow[],
  today: string,
): Omit<ProgressData, 'loading' | 'error' | 'dismissError'> {
  // date → set of habit ids completed that day.
  const byDate = new Map<string, Set<string>>();
  for (const row of completions) {
    let set = byDate.get(row.completed_at);
    if (!set) {
      set = new Set();
      byDate.set(row.completed_at, set);
    }
    set.add(row.habit_id);
  }

  const created = habits.map(createdLocalISO);
  const weekDays = lastNDaysISO(WEEK_DAYS);

  // Weekly bars + this-week totals.
  let totalCompleted = 0;
  let totalPossible = 0;
  const week: WeekDay[] = weekDays.map((iso) => {
    const done = byDate.get(iso);
    let completed = 0;
    let possible = 0;
    habits.forEach((h, i) => {
      if (!activeOn(created[i], iso)) return;
      possible += 1;
      if (done?.has(h.id)) completed += 1;
    });
    totalCompleted += completed;
    totalPossible += possible;
    return { iso, completed, possible, fraction: possible ? completed / possible : 0, isToday: iso === today };
  });
  const totals = {
    completed: totalCompleted,
    possible: totalPossible,
    percent: totalPossible ? Math.round((100 * totalCompleted) / totalPossible) : 0,
  };

  // Per-habit consistency dots.
  const perHabit: HabitProgress[] = habits.map((h, i) => {
    const cells = weekDays.map<DayCell>((iso) => {
      if (!activeOn(created[i], iso)) return 'inactive';
      return byDate.get(iso)?.has(h.id) ? 'done' : 'missed';
    });
    let doneCount = 0;
    let activeDays = 0;
    for (const c of cells) {
      if (c !== 'inactive') activeDays += 1;
      if (c === 'done') doneCount += 1;
    }
    return { id: h.id, name: h.name, cells, doneCount, activeDays };
  });

  // Perfect-day streak: a day is "perfect" when at least one habit was active and
  // every active habit was completed. Walk back from today (or yesterday, so a
  // not-yet-finished today doesn't read as broken) until a day isn't perfect.
  const isPerfect = (iso: string): boolean => {
    const done = byDate.get(iso);
    let anyActive = false;
    for (let i = 0; i < habits.length; i++) {
      if (!activeOn(created[i], iso)) continue;
      anyActive = true;
      if (!done?.has(habits[i].id)) return false;
    }
    return anyActive;
  };
  const earliest = addDaysISO(today, -(WINDOW_DAYS - 1));
  let cursor = isPerfect(today) ? today : addDaysISO(today, -1);
  let streak = 0;
  while (cursor >= earliest && isPerfect(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  // Counted all the way to the window edge while still perfect → the real streak may be longer.
  const streakCapped = streak > 0 && cursor < earliest;

  return { habitsCount: habits.length, week, totals, perHabit, streak, streakCapped };
}

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

  const fetchData = useCallback(async () => {
    if (!userId) return;
    const day = todayLocalISO();
    const since = addDaysISO(day, -(WINDOW_DAYS - 1));
    try {
      const [habitsRes, completionsRes] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', userId).order('position', { ascending: true }),
        supabase
          .from('habit_completions')
          .select('habit_id, completed_at')
          .eq('user_id', userId)
          .gte('completed_at', since),
      ]);
      if (habitsRes.error) throw habitsRes.error;
      if (completionsRes.error) throw completionsRes.error;
      setToday(day);
      setHabits(habitsRes.data ?? []);
      setCompletions(completionsRes.data ?? []);
      setError(null);
    } catch {
      setError('Could not load your progress. Reopen the tab to retry.');
    }
  }, [userId]);

  // Fetch on focus (covers the first mount too) so the view reflects ticks made
  // on the Habits tab when the user switches back here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        await fetchData();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
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

  return { loading, error, dismissError, ...derived };
}
