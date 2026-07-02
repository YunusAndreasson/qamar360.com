import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import type { Tables, TablesInsert } from '@/lib/database.types';
import { addDaysISO, hijriMonthRange, hijriParts, scheduledOn, todayLocalISO, type HijriSchedule } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { moonIllumination } from '@/lib/moon';
import { rescheduleAll, setAppBadgeCount } from '@/lib/notifications';
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
  /** A numeric daily target (a "count goal"), or `null` for a plain binary habit. */
  target_count?: number | null;
  /** Optional unit label shown next to the count ("pages", "cups"); `null` for none. */
  target_unit?: string | null;
};

/** Everything needed to create a habit (name + schedule + optional reminder). */
export type HabitCreate = {
  name: string;
  schedule_days: number[];
  reminder_time: string | null;
  /** A Hijri recurrence instead of weekdays; omit/null for a weekly habit. */
  hijri_schedule?: HijriSchedule | null;
  /** A numeric daily target (a "count goal"); omit/null for a plain binary habit. */
  target_count?: number | null;
  /** Optional unit label shown next to the count ("pages", "cups"). */
  target_unit?: string | null;
};

/** How far back the day-stepper lets you backfill a missed completion. */
const BACKFILL_DAYS = 30;

// Plain-language messages for the failed actions, spelled once so the copy stays consistent
// wherever the same failure is surfaced.
const LOAD_ERROR = 'Could not load your habits. Check your connection and try again.';
const UPDATE_ERROR = 'Could not update that habit. Check your connection.';
const ACCOUNT_SETUP_ERROR = 'Could not set up your account. Try again.';

/** The habit_completions unique key an upsert conflicts on (one row per habit per day). */
const COMPLETION_CONFLICT = 'habit_id,completed_at';

/** Safety cap on the first load: if the network (or a stale session) hangs, we flip to a
 *  retryable error instead of spinning forever. Mirrors AuthProvider's `initialized` net. */
const LOAD_TIMEOUT_MS = 12000;

/** Tonight's moon illumination (0–1) for a given local date, so the day-complete haptic can carry
 *  the weight of the moon. `undefined` when the runtime has no Islamic calendar (the haptic then
 *  falls back to its default beat). */
function moonLitFor(iso: string): number | undefined {
  const parts = hijriParts(iso);
  const range = hijriMonthRange(iso);
  if (!parts || !range) return undefined;
  return moonIllumination(parts.day, range.length).illumination;
}

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
  /** Ids of habits ticked off for `viewDate` (count goals included once they hit their target). */
  completed: Set<string>;
  /** Ids of habits skipped (legitimately excused) for `viewDate` — excluded from the rate. */
  skipped: Set<string>;
  /** For count-goal habits: the count logged for `viewDate` (habit id → count). */
  counts: Map<string, number>;
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
  /** Step a count-goal habit's logged count for `viewDate` by `delta` (clamped to 0…target). */
  adjustHabitCount: (habitId: string, delta: number) => Promise<void>;
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
 * Settings tab can call it directly without consuming the habits context; the Habits tab
 * picks the change up via its focus-refetch on return. Throws on failure.
 */
export async function clearCompletionHistory(userId: string): Promise<void> {
  const { error } = await supabase.from('habit_completions').delete().eq('user_id', userId);
  if (error) throw error;
}

/** Delete a habit's completion row for a single day (back to "open"). Throws on error. */
async function deleteCompletion(habitId: string, day: string): Promise<void> {
  const { error } = await supabase
    .from('habit_completions')
    .delete()
    .eq('habit_id', habitId)
    .eq('completed_at', day);
  if (error) throw error;
}

/** Upsert a habit's completion row for a day (one row per habit per day). Throws on error. */
async function upsertCompletion(row: TablesInsert<'habit_completions'>): Promise<void> {
  const { error } = await supabase.from('habit_completions').upsert(row, { onConflict: COMPLETION_CONFLICT });
  if (error) throw error;
}

/**
 * Fire the completion haptic for ticking `habitId` on `day`: the celebratory, moon-weighted beat
 * when this closes every open (scheduled, non-skipped) habit for the day, otherwise the plain
 * "done" tap. Shared by the binary toggle and the count-goal stepper so the day-complete rule
 * lives in one place.
 */
function celebrateIfDayComplete(
  habits: Habit[],
  skipped: Set<string>,
  completed: Set<string>,
  habitId: string,
  day: string,
): void {
  const openIds = habits.filter((h) => scheduledOn(h, day) && !skipped.has(h.id)).map((h) => h.id);
  const dayComplete = openIds.length > 0 && openIds.every((id) => id === habitId || completed.has(id));
  if (dayComplete) haptics.celebrate(moonLitFor(day));
  else haptics.completed();
}

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [stacks, setStacks] = useState<HabitStack[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<string>(() => todayLocalISO());
  const [viewDate, setViewDateState] = useState<string>(() => todayLocalISO());

  // Refs mirror state so async handlers read the latest values without stale closures.
  const habitsRef = useRef(habits);
  const stacksRef = useRef(stacks);
  const completedRef = useRef(completed);
  const skippedRef = useRef(skipped);
  const countsRef = useRef(counts);
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
    countsRef.current = counts;
  }, [counts]);
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
      setError(LOAD_ERROR);
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
      setError(LOAD_ERROR);
      return;
    }
    setStacks(data ?? []);
  }, [userId]);

  const fetchCompletions = useCallback(
    async (day: string) => {
      if (!userId) return;
      const { data, error: completionsError } = await supabase
        .from('habit_completions')
        .select('habit_id, status, count')
        .eq('user_id', userId)
        .eq('completed_at', day);
      if (completionsError) {
        setError(LOAD_ERROR);
        return;
      }
      const rows = data ?? [];
      // 'done' = fully complete (binary tick, or a count goal that reached its target);
      // 'partial' rows are in-progress count goals and stay OPEN (not in `completed`).
      setCompleted(new Set(rows.filter((row) => row.status === 'done').map((row) => row.habit_id)));
      setSkipped(new Set(rows.filter((row) => row.status === 'skipped').map((row) => row.habit_id)));
      setCounts(
        new Map(
          rows
            .filter((row): row is typeof row & { count: number } => row.count != null)
            .map((row) => [row.habit_id, row.count]),
        ),
      );
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
      setError(LOAD_ERROR);
    }
  }, [refresh]);

  // Re-run the first load on demand (the Today error state's "Try again").
  const reload = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  // Initial load — habits plus today's completions. This provider mounts at the authed
  // (tabs) root and remounts on each entry, so the user is fixed for its life.
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
    // don't show the previous day's ticks/skips/counts while the new day loads
    setCompleted(new Set());
    setSkipped(new Set());
    setCounts(new Map());
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
  // Effect Event (stable, non-reactive): reads the latest `reminders` without the sync
  // effect having to depend on its per-render array identity. The signature string is the
  // real trigger — reorders/ticks that don't touch reminder fields leave it unchanged.
  const syncReminders = useEffectEvent(() => {
    void rescheduleAll(reminders);
  });
  useEffect(() => {
    syncReminders();
  }, [reminderSignature]);

  const remainingToday = useMemo(
    () => habits.filter((h) => scheduledOn(h, today) && !completed.has(h.id) && !skipped.has(h.id)).length,
    [habits, completed, skipped, today],
  );

  // Keep the home-screen app icon badge aligned with the same "open today" count shown in
  // the Habits tab badge. Scheduled notifications also set this while the app is closed.
  useEffect(() => {
    void setAppBadgeCount(userId ? remainingToday : 0);
  }, [userId, remainingToday]);

  useEffect(
    () => () => {
      void setAppBadgeCount(0);
    },
    [],
  );

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
        celebrateIfDayComplete(habitsRef.current, skippedRef.current, completedRef.current, habitId, day);
      }

      try {
        if (wasDone) {
          await deleteCompletion(habitId, day);
        } else {
          // Upsert (not insert) so an existing row — a prior skip, or an idempotent
          // re-tick — is flipped to 'done' rather than colliding on the unique key.
          await upsertCompletion({ habit_id: habitId, user_id: userId, completed_at: day, status: 'done' });
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
        setError(UPDATE_ERROR);
      } finally {
        pending.current.delete(habitId);
      }
    },
    [userId],
  );

  // Step a count-goal habit's logged count for the viewed day by `delta`, clamped to
  // 0…target. Mirrors `toggleHabit` (optimistic, single in-flight per habit, rolls back
  // on failure), but persists the running count on the single habit-day row:
  //   next <= 0        → delete the row (back to open)
  //   0 < next < target → status 'partial', count = next  (in progress, still open)
  //   next >= target    → status 'done',    count = target (closed — counts toward the rate)
  const adjustHabitCount = useCallback(
    async (habitId: string, delta: number) => {
      if (!userId) return;
      if (habitId.startsWith('temp-')) return; // not persisted yet
      if (pending.current.has(habitId)) return; // ignore overlapping taps
      const habit = habitsRef.current.find((h) => h.id === habitId);
      const target = habit?.target_count;
      if (!habit || target == null) return; // count goals only
      pending.current.add(habitId);

      const day = viewDateRef.current;
      const prevCount = countsRef.current.get(habitId) ?? 0;
      const wasDone = completedRef.current.has(habitId);
      const wasSkipped = skippedRef.current.has(habitId);
      const next = Math.min(Math.max(prevCount + delta, 0), target);
      if (next === prevCount && !wasSkipped) {
        pending.current.delete(habitId); // already at a clamp bound, nothing to do
        return;
      }
      const nowDone = next >= target;

      // Optimistic update: the running count, "done" membership (count goal closes at its
      // target), and clearing any prior skip (logging and skipping are mutually exclusive).
      setCounts((prev) => {
        const m = new Map(prev);
        if (next <= 0) m.delete(habitId);
        else m.set(habitId, next);
        return m;
      });
      setCompleted((prev) => {
        if (nowDone === prev.has(habitId)) return prev;
        const s = new Set(prev);
        if (nowDone) s.add(habitId);
        else s.delete(habitId);
        return s;
      });
      if (wasSkipped) {
        setSkipped((prev) => {
          const s = new Set(prev);
          s.delete(habitId);
          return s;
        });
      }

      // Haptics matched to the step: a light "undo" tap when stepping down, a solid tap on
      // each step up — upgraded to a celebratory buzz when reaching the target closes every
      // open habit scheduled for the day (mirrors `toggleHabit`).
      if (next < prevCount) {
        haptics.uncompleted();
      } else if (nowDone && !wasDone) {
        celebrateIfDayComplete(habitsRef.current, skippedRef.current, completedRef.current, habitId, day);
      } else {
        haptics.selection();
      }

      try {
        if (next <= 0) {
          await deleteCompletion(habitId, day);
        } else {
          await upsertCompletion({
            habit_id: habitId,
            user_id: userId,
            completed_at: day,
            count: next,
            status: nowDone ? 'done' : 'partial',
          });
        }
      } catch {
        // The day may have changed mid-flight; only roll back if we're still on it.
        if (viewDateRef.current === day) {
          setCounts((prev) => {
            const m = new Map(prev);
            if (prevCount <= 0) m.delete(habitId);
            else m.set(habitId, prevCount);
            return m;
          });
          setCompleted((prev) => {
            const s = new Set(prev);
            if (wasDone) s.add(habitId);
            else s.delete(habitId);
            return s;
          });
          if (wasSkipped) {
            setSkipped((prev) => {
              const s = new Set(prev);
              s.add(habitId);
              return s;
            });
          }
        }
        setError(UPDATE_ERROR);
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
      const prevCount = countsRef.current.get(habitId);

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
      // Skipping a count goal clears its running count for the day (mutually exclusive).
      if (!wasSkipped && prevCount != null) {
        setCounts((prev) => {
          const next = new Map(prev);
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
          await deleteCompletion(habitId, day);
        } else {
          // Upsert so a prior 'done'/'partial' row for the day is converted to 'skipped'
          // (and any count goal's running count cleared).
          await upsertCompletion({ habit_id: habitId, user_id: userId, completed_at: day, status: 'skipped', count: null });
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
          if (!wasSkipped && prevCount != null) {
            setCounts((prev) => {
              const next = new Map(prev);
              next.set(habitId, prevCount);
              return next;
            });
          }
        }
        setError(UPDATE_ERROR);
      } finally {
        pending.current.delete(habitId);
      }
    },
    [userId],
  );

  // Temp-id rows the user removed while their insert was still in flight. Without this,
  // the insert's success path would swap the (now-deleted) temp row for the server row and
  // resurrect the habit — tap-add then tap-remove would quietly re-add it.
  const cancelledTempIds = useRef<Set<string>>(new Set());

  const createHabit = useCallback(
    async ({ name: rawName, schedule_days, reminder_time, hijri_schedule = null, target_count = null, target_unit = null }: HabitCreate) => {
      if (!userId) return;
      const name = rawName.trim();
      if (!name) return;

      try {
        await ensureUserRow();
      } catch {
        setError(ACCOUNT_SETUP_ERROR);
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
        target_count,
        target_unit,
        stack_id: null,
      };
      setHabits((prev) => [...prev, optimistic]);

      try {
        const { data, error: insError } = await supabase
          .from('habits')
          .insert({ user_id: userId, name, position, schedule_days, reminder_time, hijri_schedule, target_count, target_unit })
          .select()
          .single();
        if (insError) throw insError;
        // Removed while in flight → honor the removal: take the fresh server row back down.
        if (cancelledTempIds.current.delete(tempId)) {
          void supabase.from('habits').delete().eq('id', (data as Habit).id);
          return;
        }
        // Swap the temp row for the persisted one (real id).
        setHabits((prev) => prev.map((h) => (h.id === tempId ? (data as Habit) : h)));
      } catch {
        cancelledTempIds.current.delete(tempId);
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
        setError(ACCOUNT_SETUP_ERROR);
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
        target_count: input.target_count ?? null,
        target_unit: input.target_unit ?? null,
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
              target_count: input.target_count ?? null,
              target_unit: input.target_unit ?? null,
            })),
          )
          .select();
        if (insError) throw insError;
        const all = (data ?? []) as Habit[];
        // Rows removed while the insert was in flight (matched by position — ids were temp):
        // honor the removals by taking their fresh server rows back down, keep the rest.
        const cancelledPos = new Set(
          optimistic.filter((o) => cancelledTempIds.current.delete(o.id)).map((o) => o.position),
        );
        const persisted = all.filter((p) => {
          if (!cancelledPos.has(p.position)) return true;
          void supabase.from('habits').delete().eq('id', p.id);
          return false;
        });
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
        for (const o of optimistic) cancelledTempIds.current.delete(o.id);
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
      const prevStacks = stacksRef.current;
      const wasDone = completedRef.current.has(habitId);
      const wasSkipped = skippedRef.current.has(habitId);
      const emptyStackId =
        removed.stack_id &&
        !habitsRef.current.some((h) => h.id !== habitId && h.stack_id === removed.stack_id)
          ? removed.stack_id
          : null;

      // Optimistic removal.
      setHabits((prev) => prev.filter((h) => h.id !== habitId));
      if (emptyStackId) setStacks((prev) => prev.filter((s) => s.id !== emptyStackId));
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

      if (habitId.startsWith('temp-')) {
        // Never persisted — but its insert may still be in flight; mark it so the insert's
        // success path takes the server row back down instead of resurrecting it.
        cancelledTempIds.current.add(habitId);
        return;
      }

      try {
        const { error: delError } = await supabase.from('habits').delete().eq('id', habitId);
        if (delError) throw delError;
        // Completions cascade-delete via the FK — no manual cleanup needed.
        // If that was a stack's last member, drop the now-empty stack too.
        if (emptyStackId) {
          const { error: stackError } = await supabase.from('habit_stacks').delete().eq('id', emptyStackId);
          if (stackError) {
            setStacks(prevStacks);
            setError('Deleted the habit, but could not remove its empty stack. Pull down to refresh.');
          }
        }
      } catch {
        // Restore on failure, keeping position order.
        setHabits((prev) => [...prev, removed].sort((a, b) => a.position - b.position));
        setStacks(prevStacks);
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

      const persistable = reordered.filter((h) => {
        if (h.id.startsWith('temp-')) return false;
        return byId.get(h.id)?.position !== h.position;
      });
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
    const prevById = new Map(prevHabits.map((h) => [h.id, h]));
    const persistable = rows.filter((h) => {
      if (h.id.startsWith('temp-')) return false;
      const prev = prevById.get(h.id);
      return prev?.position !== h.position || (prev?.stack_id ?? null) !== (h.stack_id ?? null);
    });
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
        setError(ACCOUNT_SETUP_ERROR);
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
      counts,
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
      adjustHabitCount,
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
    counts,
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
    adjustHabitCount,
    skipHabit,
    updateHabit,
    deleteHabit,
    reorderHabits,
    createStack,
    updateStack,
    deleteStack,
  ]);

  return <HabitsContext value={value}>{children}</HabitsContext>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within a HabitsProvider');
  return ctx;
}
