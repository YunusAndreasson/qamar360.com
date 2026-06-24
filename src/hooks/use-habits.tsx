import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import type { Tables } from '@/lib/database.types';
import { addDaysISO, DAILY_SCHEDULE, todayLocalISO } from '@/lib/dates';
import { rescheduleAll } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export type Habit = Tables<'habits'>;

/** Editable fields of a habit. */
export type HabitPatch = {
  name?: string;
  schedule_days?: number[];
  reminder_time?: string | null;
};

/** How far back the day-stepper lets you backfill a missed completion. */
const BACKFILL_DAYS = 30;

type HabitsContextValue = {
  /** Habits for the current user, ordered by `position`. */
  habits: Habit[];
  /** Ids of habits ticked off for `viewDate`. */
  completed: Set<string>;
  /** True only during the first load. */
  loading: boolean;
  /** Plain-language message for the last failed action, or null. */
  error: string | null;
  /** The real local `YYYY-MM-DD` today (upper bound of the stepper). */
  today: string;
  /** The day currently shown/edited — `today`, or up to `BACKFILL_DAYS` earlier. */
  viewDate: string;
  /** Whether `viewDate` is today. */
  isToday: boolean;
  /** Whether the stepper can go further back. */
  canGoBack: boolean;
  dismissError: () => void;
  /** Jump to a specific day (clamped to the allowed range). */
  setViewDate: (iso: string) => void;
  /** Step the viewed day by `delta` days (clamped). */
  stepDay: (delta: number) => void;
  addHabit: (name: string) => Promise<void>;
  toggleHabit: (habitId: string) => Promise<void>;
  updateHabit: (habitId: string, patch: HabitPatch) => Promise<void>;
  deleteHabit: (habitId: string) => Promise<void>;
  reorderHabits: (orderedIds: string[]) => Promise<void>;
};

const HabitsContext = createContext<HabitsContextValue | null>(null);

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = '23505';

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<string>(() => todayLocalISO());
  const [viewDate, setViewDateState] = useState<string>(() => todayLocalISO());

  // Refs mirror state so async handlers read the latest values without stale closures.
  const habitsRef = useRef(habits);
  const completedRef = useRef(completed);
  const todayRef = useRef(today);
  const viewDateRef = useRef(viewDate);
  const ensuredUserRow = useRef(false);
  const pending = useRef<Set<string>>(new Set()); // habit ids with an in-flight toggle

  useEffect(() => {
    habitsRef.current = habits;
  }, [habits]);
  useEffect(() => {
    completedRef.current = completed;
  }, [completed]);
  useEffect(() => {
    todayRef.current = today;
  }, [today]);
  useEffect(() => {
    viewDateRef.current = viewDate;
  }, [viewDate]);

  const fetchHabits = useCallback(async () => {
    if (!userId) return;
    const { data, error: habitsError } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });
    if (habitsError) {
      setError('Could not load your habits. Reopen the app to retry.');
      return;
    }
    setHabits(data ?? []);
  }, [userId]);

  const fetchCompletions = useCallback(
    async (day: string) => {
      if (!userId) return;
      const { data, error: completionsError } = await supabase
        .from('habit_completions')
        .select('habit_id')
        .eq('user_id', userId)
        .eq('completed_at', day);
      if (completionsError) {
        setError('Could not load your habits. Reopen the app to retry.');
        return;
      }
      setCompleted(new Set((data ?? []).map((row) => row.habit_id)));
    },
    [userId],
  );

  // Initial load — habits plus today's completions. This provider mounts inside the
  // authed (tabs) screen and remounts on each entry, so the user is fixed for its life.
  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.all([fetchHabits(), fetchCompletions(viewDateRef.current)]);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchHabits, fetchCompletions]);

  // Refetch completions when the viewed day changes (the mount load covers the first day).
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    setCompleted(new Set()); // don't show the previous day's ticks while the new day loads
    void fetchCompletions(viewDate);
  }, [viewDate, fetchCompletions]);

  // Day rollover: when the app returns to the foreground after midnight, advance today
  // (and follow into the new day if we were showing "today"), then refetch.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !userId) return;
      const now = todayLocalISO();
      if (now === todayRef.current) return;
      const wasOnToday = viewDateRef.current === todayRef.current;
      setToday(now);
      void fetchHabits();
      if (wasOnToday) {
        setViewDateState(now); // the viewDate effect will refetch its completions
      } else {
        void fetchCompletions(viewDateRef.current);
      }
    });
    return () => sub.remove();
  }, [userId, fetchHabits, fetchCompletions]);

  // Keep OS reminders in sync with the habits. Keyed on the reminder-relevant fields
  // only, so reorders/ticks (which don't change them) don't churn the schedule.
  const reminders = useMemo(
    () => habits.map((h) => ({ name: h.name, reminder_time: h.reminder_time, schedule_days: h.schedule_days })),
    [habits],
  );
  const reminderSignature = JSON.stringify(reminders);
  useEffect(() => {
    void rescheduleAll(reminders);
    // `reminders` is captured for the render whose signature changed; listing it would
    // re-run every render (new array identity). The signature is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderSignature]);

  // The `users` row backing `habits.user_id` is not auto-created on signup, so
  // self-provision it (idempotently) before the first write.
  const ensureUserRow = useCallback(async () => {
    if (ensuredUserRow.current || !user) return;
    const { error: upsertError } = await supabase
      .from('users')
      .upsert({ id: user.id, email: user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });
    if (upsertError) throw upsertError;
    ensuredUserRow.current = true;
  }, [user]);

  const setViewDate = useCallback((iso: string) => {
    const max = todayRef.current;
    const min = addDaysISO(max, -BACKFILL_DAYS);
    setViewDateState(iso > max ? max : iso < min ? min : iso);
  }, []);

  const stepDay = useCallback(
    (delta: number) => {
      setViewDate(addDaysISO(viewDateRef.current, delta));
    },
    [setViewDate],
  );

  const toggleHabit = useCallback(
    async (habitId: string) => {
      if (!userId) return;
      if (habitId.startsWith('temp-')) return; // not persisted yet
      if (pending.current.has(habitId)) return; // ignore double-taps
      pending.current.add(habitId);

      const day = viewDateRef.current;
      const wasDone = completedRef.current.has(habitId);

      // Optimistic flip — feedback is immediate, before the network returns.
      setCompleted((prev) => {
        const next = new Set(prev);
        if (wasDone) next.delete(habitId);
        else next.add(habitId);
        return next;
      });

      try {
        if (wasDone) {
          const { error: delError } = await supabase
            .from('habit_completions')
            .delete()
            .eq('habit_id', habitId)
            .eq('completed_at', day);
          if (delError) throw delError;
        } else {
          const { error: insError } = await supabase
            .from('habit_completions')
            .insert({ habit_id: habitId, user_id: userId, completed_at: day });
          // A duplicate means it is already done — idempotent, treat as success.
          if (insError && insError.code !== UNIQUE_VIOLATION) throw insError;
        }
      } catch {
        // The day may have changed mid-flight; only roll back if we're still on it.
        if (viewDateRef.current === day) {
          setCompleted((prev) => {
            const next = new Set(prev);
            if (wasDone) next.add(habitId);
            else next.delete(habitId);
            return next;
          });
        }
        setError('Could not update that habit. Check your connection.');
      } finally {
        pending.current.delete(habitId);
      }
    },
    [userId],
  );

  const addHabit = useCallback(
    async (rawName: string) => {
      if (!userId) return;
      const name = rawName.trim();
      if (!name) return;

      try {
        await ensureUserRow();
      } catch {
        setError('Could not set up your account. Try again.');
        return;
      }

      // max(position) + 1 (not length) so positions survive gaps from deletes.
      const position = habitsRef.current.reduce((max, h) => Math.max(max, h.position), -1) + 1;
      const tempId = `temp-${Date.now()}`;
      const optimistic: Habit = {
        id: tempId,
        user_id: userId,
        name,
        position,
        created_at: null,
        updated_at: null,
        schedule_days: DAILY_SCHEDULE,
        reminder_time: null,
      };
      setHabits((prev) => [...prev, optimistic]);

      try {
        const { data, error: insError } = await supabase
          .from('habits')
          .insert({ user_id: userId, name, position })
          .select()
          .single();
        if (insError) throw insError;
        // Swap the temp row for the persisted one (real id).
        setHabits((prev) => prev.map((h) => (h.id === tempId ? data : h)));
      } catch {
        setHabits((prev) => prev.filter((h) => h.id !== tempId));
        setError('Could not add that habit. Check your connection.');
      }
    },
    [userId, ensureUserRow],
  );

  const updateHabit = useCallback(
    async (habitId: string, patch: HabitPatch) => {
      if (!userId) return;
      if (habitId.startsWith('temp-')) return; // not persisted yet
      const prev = habitsRef.current.find((h) => h.id === habitId);
      if (!prev) return;

      // Optimistic patch.
      setHabits((list) => list.map((h) => (h.id === habitId ? { ...h, ...patch } : h)));

      try {
        const { error: updError } = await supabase.from('habits').update(patch).eq('id', habitId);
        if (updError) throw updError;
      } catch {
        setHabits((list) => list.map((h) => (h.id === habitId ? prev : h)));
        setError('Could not save your changes. Check your connection.');
      }
    },
    [userId],
  );

  const deleteHabit = useCallback(
    async (habitId: string) => {
      if (!userId) return;
      const removed = habitsRef.current.find((h) => h.id === habitId);
      if (!removed) return;
      const wasDone = completedRef.current.has(habitId);

      // Optimistic removal.
      setHabits((prev) => prev.filter((h) => h.id !== habitId));
      setCompleted((prev) => {
        if (!prev.has(habitId)) return prev;
        const next = new Set(prev);
        next.delete(habitId);
        return next;
      });

      if (habitId.startsWith('temp-')) return; // never persisted

      try {
        const { error: delError } = await supabase.from('habits').delete().eq('id', habitId);
        if (delError) throw delError;
        // Completions cascade-delete via the FK — no manual cleanup needed.
      } catch {
        // Restore on failure, keeping position order.
        setHabits((prev) => [...prev, removed].sort((a, b) => a.position - b.position));
        if (wasDone) {
          setCompleted((prev) => {
            const next = new Set(prev);
            next.add(habitId);
            return next;
          });
        }
        setError('Could not delete that habit. Check your connection.');
      }
    },
    [userId],
  );

  const reorderHabits = useCallback(
    async (orderedIds: string[]) => {
      if (!userId) return;
      const prev = habitsRef.current;
      const byId = new Map(prev.map((h) => [h.id, h]));
      const reordered = orderedIds
        .map((id, index) => {
          const h = byId.get(id);
          return h ? { ...h, position: index } : null;
        })
        .filter((h): h is Habit => h !== null);
      if (reordered.length !== prev.length) return; // unknown id — bail rather than corrupt order

      // Optimistic reorder.
      setHabits(reordered);

      const persistable = reordered.filter((h) => !h.id.startsWith('temp-'));
      try {
        const results = await Promise.all(
          persistable.map((h) => supabase.from('habits').update({ position: h.position }).eq('id', h.id)),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      } catch {
        setHabits(prev);
        setError('Could not save the new order. Check your connection.');
      }
    },
    [userId],
  );

  const dismissError = useCallback(() => setError(null), []);

  const value = useMemo<HabitsContextValue>(() => {
    const min = addDaysISO(today, -BACKFILL_DAYS);
    return {
      habits,
      completed,
      loading,
      error,
      today,
      viewDate,
      isToday: viewDate === today,
      canGoBack: viewDate > min,
      dismissError,
      setViewDate,
      stepDay,
      addHabit,
      toggleHabit,
      updateHabit,
      deleteHabit,
      reorderHabits,
    };
  }, [
    habits,
    completed,
    loading,
    error,
    today,
    viewDate,
    dismissError,
    setViewDate,
    stepDay,
    addHabit,
    toggleHabit,
    updateHabit,
    deleteHabit,
    reorderHabits,
  ]);

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within a HabitsProvider');
  return ctx;
}
