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
import { addDaysISO, scheduledOn, todayLocalISO, type HijriSchedule } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { rescheduleAll } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

/**
 * A habit row, with `hijri_schedule` narrowed from the DB's raw `Json` to the
 * structured {@link HijriSchedule}. Rows fetched from Supabase are cast to this at
 * the query boundary (the column is only ever written as a `HijriSchedule`).
 */
export type Habit = Omit<Tables<'habits'>, 'hijri_schedule'> & { hijri_schedule: HijriSchedule | null };
/** A named, ordered group of habits — presentation grouping only (see `stack_id`). */
export type HabitStack = Tables<'habit_stacks'>;

/** Editable fields of a habit. */
export type HabitPatch = {
  name?: string;
  schedule_days?: number[];
  reminder_time?: string | null;
  /** Set to a {@link HijriSchedule} to make the habit Hijri-scheduled, or `null` for weekly. */
  hijri_schedule?: HijriSchedule | null;
};

/** Everything needed to create a habit (name + schedule + optional reminder). */
export type HabitCreate = {
  name: string;
  schedule_days: number[];
  reminder_time: string | null;
  /** A Hijri recurrence instead of weekdays; omit/null for a weekly habit. */
  hijri_schedule?: HijriSchedule | null;
};

/** How far back the day-stepper lets you backfill a missed completion. */
const BACKFILL_DAYS = 30;

/** Safety cap on the first load: if the network (or a stale session) hangs, we flip to a
 *  retryable error instead of spinning forever. Mirrors AuthProvider's `initialized` net. */
const LOAD_TIMEOUT_MS = 12000;

/**
 * Rewrite the full habit id order so `orderedMemberIds` sit contiguously (in the given
 * order) at the slot of the earliest current member, preserving the order of the rest.
 * Keeps a stack's members adjacent in the single `position` space.
 */
function groupedOrder(habits: Habit[], orderedMemberIds: string[]): string[] {
  const order = [...habits].sort((a, b) => a.position - b.position).map((h) => h.id);
  const memberSet = new Set(orderedMemberIds);
  const rest = order.filter((id) => !memberSet.has(id));
  const firstIdx = order.findIndex((id) => memberSet.has(id));
  const anchor = firstIdx === -1 ? rest.length : firstIdx;
  const members = orderedMemberIds.filter((id) => order.includes(id));
  return [...rest.slice(0, anchor), ...members, ...rest.slice(anchor)];
}

type HabitsContextValue = {
  /** Habits for the current user, ordered by `position`. */
  habits: Habit[];
  /** The user's habit stacks (named groups). Membership lives on `habit.stack_id`. */
  stacks: HabitStack[];
  /** Ids of habits ticked off for `viewDate`. */
  completed: Set<string>;
  /** Ids of habits skipped (legitimately excused) for `viewDate` — excluded from the rate. */
  skipped: Set<string>;
  /** True only during the first load. */
  loading: boolean;
  /** Plain-language message for the last failed action, or null. */
  error: string | null;
  /** The real local `YYYY-MM-DD` today (upper bound of the stepper). */
  today: string;
  /** The day currently shown/edited — `today`, or up to `BACKFILL_DAYS` earlier. */
  viewDate: string;
  /** The earliest day the picker/stepper may reach (`today − BACKFILL_DAYS`). */
  minViewDate: string;
  /** Whether `viewDate` is today. */
  isToday: boolean;
  /** Whether the stepper can go further back. */
  canGoBack: boolean;
  dismissError: () => void;
  /** Re-pull habits, stacks, and the viewed day's completions (used on Habits-tab focus). */
  refresh: () => Promise<void>;
  /** Re-run the first load, showing the loading state again — the Today error state's "Try again". */
  reload: () => Promise<void>;
  /** Jump to a specific day (clamped to the allowed range). */
  setViewDate: (iso: string) => void;
  /** Step the viewed day by `delta` days (clamped). */
  stepDay: (delta: number) => void;
  createHabit: (input: HabitCreate) => Promise<void>;
  /** Create several habits at once (Discover "starter set" / routines); returns the new rows. */
  createHabits: (inputs: HabitCreate[]) => Promise<Habit[]>;
  toggleHabit: (habitId: string) => Promise<void>;
  /** Toggle a habit's "skipped" (excused) state for `viewDate`: open/done → skipped, skipped → open. */
  skipHabit: (habitId: string) => Promise<void>;
  updateHabit: (habitId: string, patch: HabitPatch) => Promise<void>;
  deleteHabit: (habitId: string) => Promise<void>;
  reorderHabits: (orderedIds: string[]) => Promise<void>;
  /** Create a stack from existing habits (in order). Returns the new stack id, or null. */
  createStack: (name: string, orderedMemberIds: string[]) => Promise<string | null>;
  /** Rename a stack and/or set its full ordered membership. Empty membership deletes it. */
  updateStack: (stackId: string, patch: { name?: string; orderedMemberIds?: string[] }) => Promise<void>;
  /** Delete a stack; its members survive as standalone habits. */
  deleteStack: (stackId: string) => Promise<void>;
};

const HabitsContext = createContext<HabitsContextValue | null>(null);

/**
 * Delete a user's entire completion history — every check-off — for a "fresh start", while
 * leaving their habits and stacks (and reminders) intact. Standalone (not a hook) so the
 * Settings tab, which lives outside {@link HabitsProvider}, can call it directly. Throws on failure.
 */
export async function clearCompletionHistory(userId: string): Promise<void> {
  const { error } = await supabase.from('habit_completions').delete().eq('user_id', userId);
  if (error) throw error;
}

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [stacks, setStacks] = useState<HabitStack[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<string>(() => todayLocalISO());
  const [viewDate, setViewDateState] = useState<string>(() => todayLocalISO());

  // Refs mirror state so async handlers read the latest values without stale closures.
  const habitsRef = useRef(habits);
  const stacksRef = useRef(stacks);
  const completedRef = useRef(completed);
  const skippedRef = useRef(skipped);
  const todayRef = useRef(today);
  const viewDateRef = useRef(viewDate);
  const ensuredUserRow = useRef(false);
  const pending = useRef<Set<string>>(new Set()); // habit ids with an in-flight toggle

  useEffect(() => {
    habitsRef.current = habits;
  }, [habits]);
  useEffect(() => {
    stacksRef.current = stacks;
  }, [stacks]);
  useEffect(() => {
    completedRef.current = completed;
  }, [completed]);
  useEffect(() => {
    skippedRef.current = skipped;
  }, [skipped]);
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
      setError('Could not load your habits. Check your connection and try again.');
      return;
    }
    setHabits((data ?? []) as Habit[]);
  }, [userId]);

  const fetchStacks = useCallback(async () => {
    if (!userId) return;
    const { data, error: stacksError } = await supabase
      .from('habit_stacks')
      .select('*')
      .eq('user_id', userId);
    if (stacksError) {
      setError('Could not load your habits. Check your connection and try again.');
      return;
    }
    setStacks(data ?? []);
  }, [userId]);

  const fetchCompletions = useCallback(
    async (day: string) => {
      if (!userId) return;
      const { data, error: completionsError } = await supabase
        .from('habit_completions')
        .select('habit_id, status')
        .eq('user_id', userId)
        .eq('completed_at', day);
      if (completionsError) {
        setError('Could not load your habits. Check your connection and try again.');
        return;
      }
      const rows = data ?? [];
      setCompleted(new Set(rows.filter((row) => row.status !== 'skipped').map((row) => row.habit_id)));
      setSkipped(new Set(rows.filter((row) => row.status === 'skipped').map((row) => row.habit_id)));
    },
    [userId],
  );

  // Re-pull habits, stacks, and the viewed day's completions. Called on Habits-tab focus so
  // changes made outside this provider (e.g. a progress reset in Settings) appear on return —
  // the same focus-refetch the Progress tab uses.
  const refresh = useCallback(async () => {
    await Promise.all([fetchHabits(), fetchStacks(), fetchCompletions(viewDateRef.current)]);
  }, [fetchHabits, fetchStacks, fetchCompletions]);

  // One full load, raced against a timeout so a hung client (a stale session, a dropped
  // socket) surfaces a retryable error instead of an endless spinner. A late-settling query
  // just refreshes the data harmlessly. Clears any prior error so a retry starts clean.
  const load = useCallback(async () => {
    setError(null);
    const work = refresh().then(() => 'ok' as const);
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS));
    if ((await Promise.race([work, timeout])) === 'timeout') {
      setError('Could not load your habits. Check your connection and try again.');
    }
  }, [refresh]);

  // Re-run the first load on demand (the Today error state's "Try again").
  const reload = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  // Initial load — habits plus today's completions. This provider mounts inside the
  // authed (tabs) screen and remounts on each entry, so the user is fixed for its life.
  useEffect(() => {
    let active = true;
    void (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  // Refetch completions when the viewed day changes (the mount load covers the first day).
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    // don't show the previous day's ticks/skips while the new day loads
    setCompleted(new Set());
    setSkipped(new Set());
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
      void fetchStacks();
      if (wasOnToday) {
        setViewDateState(now); // the viewDate effect will refetch its completions
      } else {
        void fetchCompletions(viewDateRef.current);
      }
    });
    return () => sub.remove();
  }, [userId, fetchHabits, fetchStacks, fetchCompletions]);

  // Keep OS reminders in sync with the habits. Keyed on the reminder-relevant fields
  // only, so reorders/ticks (which don't change them) don't churn the schedule.
  const reminders = useMemo(
    () =>
      habits.map((h) => ({
        name: h.name,
        reminder_time: h.reminder_time,
        schedule_days: h.schedule_days,
        hijri_schedule: h.hijri_schedule,
        created_at: h.created_at,
      })),
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
      // Marking done overrides a prior "skipped" state for the day (one row per
      // habit-day), so remember it to restore on failure.
      const wasSkipped = skippedRef.current.has(habitId);

      // Optimistic flip — feedback is immediate, before the network returns. Marking
      // done also clears any skip (the two states are mutually exclusive).
      setCompleted((prev) => {
        const next = new Set(prev);
        if (wasDone) next.delete(habitId);
        else next.add(habitId);
        return next;
      });
      if (wasSkipped && !wasDone) {
        setSkipped((prev) => {
          const next = new Set(prev);
          next.delete(habitId);
          return next;
        });
      }

      // Tactile feedback, matched to the optimistic flip: a light "undo" tap when
      // clearing, otherwise a solid tap — upgraded to a celebratory buzz when this
      // tick completes every habit scheduled for the viewed day. Skipped acts aren't
      // "open", so they don't hold the day back from completing.
      if (wasDone) {
        haptics.uncompleted();
      } else {
        const openIds = habitsRef.current
          .filter((h) => scheduledOn(h, day) && !skippedRef.current.has(h.id))
          .map((h) => h.id);
        const dayComplete =
          openIds.length > 0 && openIds.every((id) => id === habitId || completedRef.current.has(id));
        if (dayComplete) haptics.celebrate();
        else haptics.completed();
      }

      try {
        if (wasDone) {
          const { error: delError } = await supabase
            .from('habit_completions')
            .delete()
            .eq('habit_id', habitId)
            .eq('completed_at', day);
          if (delError) throw delError;
        } else {
          // Upsert (not insert) so an existing row — a prior skip, or an idempotent
          // re-tick — is flipped to 'done' rather than colliding on the unique key.
          const { error: upError } = await supabase
            .from('habit_completions')
            .upsert(
              { habit_id: habitId, user_id: userId, completed_at: day, status: 'done' },
              { onConflict: 'habit_id,completed_at' },
            );
          if (upError) throw upError;
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
          if (wasSkipped && !wasDone) {
            setSkipped((prev) => {
              const next = new Set(prev);
              next.add(habitId);
              return next;
            });
          }
        }
        setError('Could not update that habit. Check your connection.');
      } finally {
        pending.current.delete(habitId);
      }
    },
    [userId],
  );

  // Toggle the day's "skipped" (excused) state for a habit — for legitimate misses
  // (travel, menstruation, …) that shouldn't count against the rate. Mirrors
  // `toggleHabit`: optimistic, single in-flight per habit, rolls back on failure.
  // A skip and a completion are mutually exclusive on the same habit-day (one row),
  // so skipping also clears a prior "done".
  const skipHabit = useCallback(
    async (habitId: string) => {
      if (!userId) return;
      if (habitId.startsWith('temp-')) return; // not persisted yet
      if (pending.current.has(habitId)) return; // ignore double-taps
      pending.current.add(habitId);

      const day = viewDateRef.current;
      const wasSkipped = skippedRef.current.has(habitId);
      const wasDone = completedRef.current.has(habitId);

      // Optimistic flip: skipped → open, or open/done → skipped.
      setSkipped((prev) => {
        const next = new Set(prev);
        if (wasSkipped) next.delete(habitId);
        else next.add(habitId);
        return next;
      });
      if (!wasSkipped && wasDone) {
        setCompleted((prev) => {
          const next = new Set(prev);
          next.delete(habitId);
          return next;
        });
      }

      // A skip is a quiet, neutral state change (not a win) — a light selection tick;
      // un-skipping reuses the "undo" tap.
      if (wasSkipped) haptics.uncompleted();
      else haptics.selection();

      try {
        if (wasSkipped) {
          const { error: delError } = await supabase
            .from('habit_completions')
            .delete()
            .eq('habit_id', habitId)
            .eq('completed_at', day);
          if (delError) throw delError;
        } else {
          // Upsert so a prior 'done' row for the day is converted to 'skipped'.
          const { error: upError } = await supabase
            .from('habit_completions')
            .upsert(
              { habit_id: habitId, user_id: userId, completed_at: day, status: 'skipped' },
              { onConflict: 'habit_id,completed_at' },
            );
          if (upError) throw upError;
        }
      } catch {
        // The day may have changed mid-flight; only roll back if we're still on it.
        if (viewDateRef.current === day) {
          setSkipped((prev) => {
            const next = new Set(prev);
            if (wasSkipped) next.add(habitId);
            else next.delete(habitId);
            return next;
          });
          if (!wasSkipped && wasDone) {
            setCompleted((prev) => {
              const next = new Set(prev);
              next.add(habitId);
              return next;
            });
          }
        }
        setError('Could not update that habit. Check your connection.');
      } finally {
        pending.current.delete(habitId);
      }
    },
    [userId],
  );

  const createHabit = useCallback(
    async ({ name: rawName, schedule_days, reminder_time, hijri_schedule = null }: HabitCreate) => {
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
        schedule_days,
        reminder_time,
        hijri_schedule,
        stack_id: null,
      };
      setHabits((prev) => [...prev, optimistic]);

      try {
        const { data, error: insError } = await supabase
          .from('habits')
          .insert({ user_id: userId, name, position, schedule_days, reminder_time, hijri_schedule })
          .select()
          .single();
        if (insError) throw insError;
        // Swap the temp row for the persisted one (real id).
        setHabits((prev) => prev.map((h) => (h.id === tempId ? (data as Habit) : h)));
      } catch {
        setHabits((prev) => prev.filter((h) => h.id !== tempId));
        setError('Could not add that habit. Check your connection.');
      }
    },
    [userId, ensureUserRow],
  );

  const createHabits = useCallback(
    async (inputs: HabitCreate[]): Promise<Habit[]> => {
      if (!userId) return [];
      const clean = inputs
        .map((input) => ({ ...input, name: input.name.trim() }))
        .filter((input) => input.name.length > 0);
      if (clean.length === 0) return [];

      try {
        await ensureUserRow();
      } catch {
        setError('Could not set up your account. Try again.');
        return [];
      }

      // One contiguous block of positions, computed once — looping `createHabit`
      // would re-read `habitsRef` before the prior optimistic insert committed and
      // could collide positions (and surface one error banner per habit).
      const base = habitsRef.current.reduce((max, h) => Math.max(max, h.position), -1) + 1;
      const stamp = Date.now();
      const optimistic: Habit[] = clean.map((input, k) => ({
        id: `temp-${stamp}-${k}`,
        user_id: userId,
        name: input.name,
        position: base + k,
        created_at: null,
        updated_at: null,
        schedule_days: input.schedule_days,
        reminder_time: input.reminder_time,
        hijri_schedule: input.hijri_schedule ?? null,
        stack_id: null,
      }));
      const tempIds = new Set(optimistic.map((o) => o.id));
      setHabits((prev) => [...prev, ...optimistic]);

      try {
        const { data, error: insError } = await supabase
          .from('habits')
          .insert(
            clean.map((input, k) => ({
              user_id: userId,
              name: input.name,
              position: base + k,
              schedule_days: input.schedule_days,
              reminder_time: input.reminder_time,
              hijri_schedule: input.hijri_schedule ?? null,
            })),
          )
          .select();
        if (insError) throw insError;
        const persisted = (data ?? []) as Habit[];
        // Swap the temp rows for the persisted ones (real ids), keeping position order.
        setHabits((prev) =>
          [...prev.filter((h) => !tempIds.has(h.id)), ...persisted].sort((a, b) => a.position - b.position),
        );
        // Keep the ref authoritative immediately, so an op chained right after (e.g.
        // `createStack` when adding a routine) sees the new rows before the sync effect runs.
        habitsRef.current = [...habitsRef.current.filter((h) => !tempIds.has(h.id)), ...persisted].sort(
          (a, b) => a.position - b.position,
        );
        return persisted;
      } catch {
        setHabits((prev) => prev.filter((h) => !tempIds.has(h.id)));
        setError('Could not add those habits. Check your connection.');
        return [];
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
      const wasSkipped = skippedRef.current.has(habitId);

      // Optimistic removal.
      setHabits((prev) => prev.filter((h) => h.id !== habitId));
      setCompleted((prev) => {
        if (!prev.has(habitId)) return prev;
        const next = new Set(prev);
        next.delete(habitId);
        return next;
      });
      setSkipped((prev) => {
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
        // If that was a stack's last member, drop the now-empty stack (best-effort).
        if (removed.stack_id && !habitsRef.current.some((h) => h.stack_id === removed.stack_id)) {
          const emptyStackId = removed.stack_id;
          setStacks((prev) => prev.filter((s) => s.id !== emptyStackId));
          void supabase.from('habit_stacks').delete().eq('id', emptyStackId);
        }
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
        if (wasSkipped) {
          setSkipped((prev) => {
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

  // Persist new positions + stack_id for the given habits (optimistic state already set).
  // Mirrors `reorderHabits`' per-row update; also carries the membership change.
  const persistGrouping = useCallback(async (rows: Habit[], prevHabits: Habit[]): Promise<boolean> => {
    const persistable = rows.filter((h) => !h.id.startsWith('temp-'));
    try {
      const results = await Promise.all(
        persistable.map((h) =>
          supabase.from('habits').update({ position: h.position, stack_id: h.stack_id }).eq('id', h.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      return true;
    } catch {
      setHabits(prevHabits);
      return false;
    }
  }, []);

  const createStack = useCallback(
    async (name: string, orderedMemberIds: string[]): Promise<string | null> => {
      if (!userId) return null;
      const cleanName = name.trim();
      const memberIds = orderedMemberIds.filter((id) => !id.startsWith('temp-'));
      if (!cleanName || memberIds.length === 0) return null;

      try {
        await ensureUserRow();
      } catch {
        setError('Could not set up your account. Try again.');
        return null;
      }

      const prevHabits = habitsRef.current;
      const prevStacks = stacksRef.current;

      // Insert the stack row first — we need its id to stamp members.
      let stack: HabitStack;
      try {
        const { data, error: insErr } = await supabase
          .from('habit_stacks')
          .insert({ user_id: userId, name: cleanName })
          .select()
          .single();
        if (insErr) throw insErr;
        stack = data;
      } catch {
        setError('Could not create that stack. Check your connection.');
        return null;
      }

      // Pull members together (in order) and stamp their stack_id, optimistically.
      const orderIds = groupedOrder(prevHabits, memberIds);
      const memberSet = new Set(memberIds);
      const byId = new Map(prevHabits.map((h) => [h.id, h]));
      const next = orderIds
        .map((id, index) => {
          const h = byId.get(id);
          return h ? { ...h, position: index, stack_id: memberSet.has(id) ? stack.id : h.stack_id } : null;
        })
        .filter((h): h is Habit => h !== null);
      setStacks((prev) => [...prev, stack]);
      setHabits(next);

      const ok = await persistGrouping(next, prevHabits);
      if (!ok) {
        setStacks(prevStacks);
        void supabase.from('habit_stacks').delete().eq('id', stack.id);
        setError('Could not create that stack. Check your connection.');
        return null;
      }
      return stack.id;
    },
    [userId, ensureUserRow, persistGrouping],
  );

  const deleteStack = useCallback(
    async (stackId: string) => {
      if (!userId) return;
      const prevHabits = habitsRef.current;
      const prevStacks = stacksRef.current;
      if (!prevStacks.some((s) => s.id === stackId)) return;

      // Optimistic: drop the stack; members revert to standalone.
      setStacks((prev) => prev.filter((s) => s.id !== stackId));
      setHabits((prev) => prev.map((h) => (h.stack_id === stackId ? { ...h, stack_id: null } : h)));

      try {
        const { error: delErr } = await supabase.from('habit_stacks').delete().eq('id', stackId);
        if (delErr) throw delErr;
        // Members' stack_id is cleared by the FK (on delete set null).
      } catch {
        setHabits(prevHabits);
        setStacks(prevStacks);
        setError('Could not delete that stack. Check your connection.');
      }
    },
    [userId],
  );

  const updateStack = useCallback(
    async (stackId: string, patch: { name?: string; orderedMemberIds?: string[] }) => {
      if (!userId) return;
      const prevHabits = habitsRef.current;
      const prevStacks = stacksRef.current;
      if (!prevStacks.some((s) => s.id === stackId)) return;

      const newName = patch.name?.trim();
      const memberIds = patch.orderedMemberIds?.filter((id) => !id.startsWith('temp-'));

      // No members left → the stack is meaningless; delete it.
      if (memberIds && memberIds.length === 0) {
        await deleteStack(stackId);
        return;
      }

      if (newName) {
        setStacks((prev) => prev.map((s) => (s.id === stackId ? { ...s, name: newName } : s)));
      }

      let next = prevHabits;
      if (memberIds) {
        const memberSet = new Set(memberIds);
        // Stamp new members, clear ex-members of *this* stack, leave others alone.
        const withMembership = prevHabits.map((h) =>
          memberSet.has(h.id)
            ? { ...h, stack_id: stackId }
            : h.stack_id === stackId
              ? { ...h, stack_id: null }
              : h,
        );
        const orderIds = groupedOrder(withMembership, memberIds);
        const byId = new Map(withMembership.map((h) => [h.id, h]));
        next = orderIds
          .map((id, index) => {
            const h = byId.get(id);
            return h ? { ...h, position: index } : null;
          })
          .filter((h): h is Habit => h !== null);
        setHabits(next);
      }

      try {
        if (newName) {
          const { error: nameErr } = await supabase.from('habit_stacks').update({ name: newName }).eq('id', stackId);
          if (nameErr) throw nameErr;
        }
        if (memberIds && !(await persistGrouping(next, prevHabits))) {
          setStacks(prevStacks);
          setError('Could not save the stack. Check your connection.');
        }
      } catch {
        setHabits(prevHabits);
        setStacks(prevStacks);
        setError('Could not save the stack. Check your connection.');
      }
    },
    [userId, deleteStack, persistGrouping],
  );

  const dismissError = useCallback(() => setError(null), []);

  const value = useMemo<HabitsContextValue>(() => {
    const min = addDaysISO(today, -BACKFILL_DAYS);
    return {
      habits,
      stacks,
      completed,
      skipped,
      loading,
      error,
      today,
      viewDate,
      minViewDate: min,
      isToday: viewDate === today,
      canGoBack: viewDate > min,
      dismissError,
      refresh,
      reload,
      setViewDate,
      stepDay,
      createHabit,
      createHabits,
      toggleHabit,
      skipHabit,
      updateHabit,
      deleteHabit,
      reorderHabits,
      createStack,
      updateStack,
      deleteStack,
    };
  }, [
    habits,
    stacks,
    completed,
    skipped,
    loading,
    error,
    today,
    viewDate,
    dismissError,
    refresh,
    reload,
    setViewDate,
    stepDay,
    createHabit,
    createHabits,
    toggleHabit,
    skipHabit,
    updateHabit,
    deleteHabit,
    reorderHabits,
    createStack,
    updateStack,
    deleteStack,
  ]);

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within a HabitsProvider');
  return ctx;
}
