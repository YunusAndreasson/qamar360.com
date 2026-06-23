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
import { todayLocalISO } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

export type Habit = Tables<'habits'>;

type HabitsContextValue = {
  /** Habits for the current user, ordered by `position`. */
  habits: Habit[];
  /** Ids of habits ticked off for `today`. */
  completedToday: Set<string>;
  /** True only during the first load. */
  loading: boolean;
  /** Plain-language message for the last failed action, or null. */
  error: string | null;
  /** Local `YYYY-MM-DD` the screen is currently showing. */
  today: string;
  dismissError: () => void;
  addHabit: (name: string) => Promise<void>;
  toggleHabit: (habitId: string) => Promise<void>;
  deleteHabit: (habitId: string) => Promise<void>;
};

const HabitsContext = createContext<HabitsContextValue | null>(null);

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = '23505';

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<string>(() => todayLocalISO());

  // Refs mirror state so async handlers read the latest values without stale closures.
  const habitsRef = useRef(habits);
  const completedRef = useRef(completedToday);
  const todayRef = useRef(today);
  const ensuredUserRow = useRef(false);
  const pending = useRef<Set<string>>(new Set()); // habit ids with an in-flight toggle

  useEffect(() => {
    habitsRef.current = habits;
  }, [habits]);
  useEffect(() => {
    completedRef.current = completedToday;
  }, [completedToday]);
  useEffect(() => {
    todayRef.current = today;
  }, [today]);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    const day = todayLocalISO();
    try {
      const [habitsRes, completionsRes] = await Promise.all([
        supabase
          .from('habits')
          .select('*')
          .eq('user_id', userId)
          .order('position', { ascending: true }),
        supabase
          .from('habit_completions')
          .select('habit_id')
          .eq('user_id', userId)
          .eq('completed_at', day),
      ]);
      if (habitsRes.error) throw habitsRes.error;
      if (completionsRes.error) throw completionsRes.error;
      setToday(day);
      setHabits(habitsRes.data ?? []);
      setCompletedToday(new Set((completionsRes.data ?? []).map((row) => row.habit_id)));
      setError(null);
    } catch {
      setError('Could not load your habits. Reopen the app to retry.');
    }
  }, [userId]);

  // Initial load. This provider is mounted inside the authed (tabs) screen and
  // remounts on each entry, so the signed-in user is fixed for its lifetime —
  // no cross-user reset needed. setState runs only after the await (no cascade).
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

  // Day rollover: when the app returns to the foreground after midnight, drop
  // yesterday's ticks and refetch today's completions.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !userId) return;
      if (todayLocalISO() !== todayRef.current) {
        setCompletedToday(new Set());
        void fetchData();
      }
    });
    return () => sub.remove();
  }, [userId, fetchData]);

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

  const toggleHabit = useCallback(
    async (habitId: string) => {
      if (!userId) return;
      if (habitId.startsWith('temp-')) return; // not persisted yet
      if (pending.current.has(habitId)) return; // ignore double-taps
      pending.current.add(habitId);

      const day = todayRef.current;
      const wasDone = completedRef.current.has(habitId);

      // Optimistic flip — feedback is immediate, before the network returns.
      setCompletedToday((prev) => {
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
        // Reversible: roll back to the prior state and surface the failure.
        setCompletedToday((prev) => {
          const next = new Set(prev);
          if (wasDone) next.add(habitId);
          else next.delete(habitId);
          return next;
        });
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
      };
      setHabits((prev) => [...prev, optimistic]);

      const insertOnce = (pos: number) =>
        supabase.from('habits').insert({ user_id: userId, name, position: pos }).select().single();

      try {
        let res = await insertOnce(position);
        if (res.error?.code === UNIQUE_VIOLATION) {
          // Position taken (e.g. a second device). Recompute from the server and retry once.
          const { data: rows } = await supabase
            .from('habits')
            .select('position')
            .eq('user_id', userId)
            .order('position', { ascending: false })
            .limit(1);
          res = await insertOnce((rows?.[0]?.position ?? -1) + 1);
        }
        if (res.error) throw res.error;
        // Swap the temp row for the persisted one (real id).
        setHabits((prev) => prev.map((h) => (h.id === tempId ? (res.data as Habit) : h)));
      } catch {
        setHabits((prev) => prev.filter((h) => h.id !== tempId));
        setError('Could not add that habit. Check your connection.');
      }
    },
    [userId, ensureUserRow],
  );

  const deleteHabit = useCallback(
    async (habitId: string) => {
      if (!userId) return;
      const removed = habitsRef.current.find((h) => h.id === habitId);
      if (!removed) return;
      const wasDone = completedRef.current.has(habitId);

      // Optimistic removal.
      setHabits((prev) => prev.filter((h) => h.id !== habitId));
      setCompletedToday((prev) => {
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
          setCompletedToday((prev) => {
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

  const dismissError = useCallback(() => setError(null), []);

  const value = useMemo<HabitsContextValue>(
    () => ({
      habits,
      completedToday,
      loading,
      error,
      today,
      dismissError,
      addHabit,
      toggleHabit,
      deleteHabit,
    }),
    [habits, completedToday, loading, error, today, dismissError, addHabit, toggleHabit, deleteHabit],
  );

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within a HabitsProvider');
  return ctx;
}
