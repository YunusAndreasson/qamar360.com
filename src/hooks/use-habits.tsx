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

import { useDayComplete } from '@/components/day-complete';
import { useAuth } from '@/hooks/use-auth';
import type { Tables, TablesInsert } from '@/lib/database.types';
import { addDaysISO, hijriMonthRange, hijriParts, scheduledOn, todayLocalISO, type HijriSchedule } from '@/lib/dates';
import { orderAfterHabitMove, type MovePlacement } from '@/lib/drag-order';
import { readHabitsSnapshot, writeHabitsSnapshot } from '@/lib/habits-cache';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import { dayOrderPlacement, momentBand, momentOf, type MomentKey } from '@/lib/moments';
import { moonIllumination } from '@/lib/moon';
import { rescheduleAll, setAppBadgeCount } from '@/lib/notifications';
import { isStackComplete } from '@/lib/progress';
import type { DayPart } from '@/lib/sun';
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

/** Trailing delay before persisting the cold-start snapshot — long enough to sit out a burst
 *  of stepper taps, short enough that a quick tick-and-background still gets cached. */
const SNAPSHOT_DEBOUNCE_MS = 400;

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
 * order) at the slot of the FIRST ordered member, preserving the order of the rest.
 * Keeps a stack's members adjacent in the single `position` space. Anchoring on the first
 * ordered member (not the earliest-positioned one) is what lets a drag-merge host the new
 * card at the drop target's slot — the target leads `orderedMemberIds` — instead of
 * teleporting it up to the dragged habit's old slot on a downward merge. For an existing
 * stack (whose members are already contiguous) the two anchors coincide.
 */
function groupedOrder(habits: Habit[], orderedMemberIds: string[]): string[] {
  const order = [...habits].sort((a, b) => a.position - b.position).map((h) => h.id);
  const memberSet = new Set(orderedMemberIds);
  const rest = order.filter((id) => !memberSet.has(id));
  const members = orderedMemberIds.filter((id) => order.includes(id));
  // `anchor` indexes the ORIGINAL order, then slices `rest`: only the non-members before it
  // survive the slice, so members between the anchor and list top collapse into the group.
  const anchorIdx = members.length > 0 ? order.indexOf(members[0]!) : -1;
  const anchor = anchorIdx === -1 ? rest.length : anchorIdx;
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
  /** Habits still open (scheduled, unticked, unskipped) for the real today — the tab badge and
   *  the OS app-icon badge read this same number, so the two can never disagree. */
  remainingToday: number;
  dismissError: () => void;
  /** Re-pull habits, stacks, and the viewed day's completions (used on Habits-tab focus).
   *  Resolves `true` when every fetch succeeded — `load()` uses this to clear a stale
   *  timeout banner; UI callers are free to ignore it. */
  refresh: () => Promise<boolean>;
  /** Re-run the first load, showing the loading state again — the Today error state's "Try again". */
  reload: () => Promise<void>;
  /** Jump to a specific day (clamped to the allowed range). */
  setViewDate: (iso: string) => void;
  createHabit: (input: HabitCreate) => Promise<void>;
  /** Create several habits at once (Discover "starter set"); returns the new rows. */
  createHabits: (inputs: HabitCreate[]) => Promise<Habit[]>;
  toggleHabit: (habitId: string) => Promise<void>;
  /** Step a count-goal habit's logged count for `viewDate` by `delta` (clamped to 0…target). */
  adjustHabitCount: (habitId: string, delta: number) => Promise<void>;
  /** Toggle a habit's "skipped" (excused) state for `viewDate`: open/done → skipped, skipped → open. */
  skipHabit: (habitId: string) => Promise<void>;
  updateHabit: (habitId: string, patch: HabitPatch) => Promise<void>;
  deleteHabit: (habitId: string) => Promise<void>;
  /** Persist a full new habit order (`position = index`) — the commit of the Today list's
   *  drag-reorder and its Move up/down accessibility actions (keep stack members contiguous;
   *  `lib/drag-order`'s unit helpers build a valid order). */
  reorderHabits: (orderedIds: string[]) => Promise<void>;
  /** Create a stack from existing habits (in order) — or, with `[]`, an intentionally empty
   *  stack (the "+ → New stack" flow) that waits on Today for its first member. Returns the new
   *  stack id, or null. Pass `stackId` to use a caller-minted id (so the card can be targeted the
   *  moment it appears — e.g. to animate a drag-merge); otherwise one is generated. `moment`
   *  anchors the stack to an occasion (lib/moments.ts): it wears the moment's emblem and lights
   *  when the moment arrives; the derived day-part band is stored alongside. */
  createStack: (
    name: string,
    orderedMemberIds: string[],
    opts?: { stackId?: string; moment?: MomentKey | null },
  ) => Promise<string | null>;
  /** Rename a stack, re-anchor its moment, and/or set its full ordered membership. Empty
   *  membership deletes it. `moment` present-and-null is an explicit clear (absent = untouched). */
  updateStack: (
    stackId: string,
    patch: { name?: string; orderedMemberIds?: string[]; moment?: MomentKey | null },
  ) => Promise<void>;
  /** Delete a stack; its members survive as standalone habits. */
  deleteStack: (stackId: string) => Promise<void>;
  /** Move one habit into a stack (`toStackId`), out to the top level (`null`), or to a new
   *  slot within its stack — the single mutation behind the Today drag's drop and the tap
   *  paths (the add-to-stack sheet, the member row's "Remove" swipe). `placement` defaults:
   *  into a stack → appended last; out of one → right after its former card. Emptying a
   *  stack deletes that now-memberless shell, unless `keepEmptyShell` (the stack-scoped Add
   *  screen un-adds without pulling the stack out from under itself). */
  moveHabit: (
    habitId: string,
    target: { toStackId: string | null; placement?: MovePlacement; keepEmptyShell?: boolean },
  ) => Promise<void>;
  /** Create a habit and land it in `stackId` (appended last) — the stack-scoped Add screen's
   *  create path. Falls back to a standalone habit if the stack vanished mid-flight. */
  createHabitInStack: (input: HabitCreate, stackId: string) => Promise<void>;
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
): { dayComplete: boolean; doneIds: string[] } {
  const openIds = habits.filter((h) => scheduledOn(h, day) && !skipped.has(h.id)).map((h) => h.id);
  const dayComplete = openIds.length > 0 && openIds.every((id) => id === habitId || completed.has(id));
  if (dayComplete) haptics.celebrate(moonLitFor(day));
  else haptics.completed();
  // When complete, `openIds` are exactly the day's done (non-skipped, all ticked) ids — handed to
  // the overlay so its degrees count the just-made ticks before they reach the server (matches Progress).
  return { dayComplete, doneIds: dayComplete ? openIds : [] };
}

/**
 * Fire the stack-complete tail beat when ticking `habitId` seals its stack — every act the
 * habit's stack has due today is now done — but only when it *doesn't* also close the whole day:
 * the day's `celebrate` owns that moment, so the two never double-buzz. The matching border flash on
 * the card is driven separately from the same `completed`/`skipped` state (see StackCard), reading
 * the same {@link isStackComplete} rule so the flash and the buzz can't disagree. A standalone
 * habit has no stack to seal, so it stays silent. `completed` is read pre-flip, so the just-ticked
 * id is passed through as done — the same stale-read guard `celebrateIfDayComplete` uses.
 */
function celebrateIfStackComplete(
  habits: Habit[],
  skipped: Set<string>,
  completed: Set<string>,
  habitId: string,
  day: string,
  dayComplete: boolean,
): void {
  if (dayComplete) return; // the day's celebration owns the moment
  const stackId = habits.find((h) => h.id === habitId)?.stack_id ?? null;
  if (!stackId) return; // not in a stack — nothing to seal
  const members = habits.filter((h) => h.stack_id === stackId && scheduledOn(h, day));
  if (isStackComplete(members, completed, skipped, habitId)) haptics.stackComplete();
}

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Seed from the last-known snapshot so a cold start paints real content on the first frame
  // instead of a skeleton (revalidated on mount below). Trusted only when the snapshot's day is
  // still today — a rolled-over or past-day snapshot falls back to the skeleton (see habits-cache).
  const [snapshot] = useState(readHabitsSnapshot);
  const seed = snapshot && snapshot.userId === userId && snapshot.day === todayLocalISO() ? snapshot : null;

  const [habits, setHabits] = useState<Habit[]>(() => seed?.habits ?? []);
  const [stacks, setStacks] = useState<HabitStack[]>(() => seed?.stacks ?? []);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set(seed?.completed));
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set(seed?.skipped));
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map(seed?.counts));
  const [loading, setLoading] = useState(() => !seed);
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
  const completionsInFlight = useRef(0); // open fetchCompletions calls (gates the snapshot write)

  // The day-complete celebration overlay (root-mounted). Fired below when a tick closes the live day.
  const { celebrate: showDayComplete } = useDayComplete();

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
    if (!userId) return true;
    const { data, error: habitsError } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });
    if (habitsError) {
      setError(LOAD_ERROR);
      return false;
    }
    setHabits((data ?? []) as Habit[]);
    return true;
  }, [userId]);

  const fetchStacks = useCallback(async () => {
    if (!userId) return true;
    const { data, error: stacksError } = await supabase
      .from('habit_stacks')
      .select('*')
      .eq('user_id', userId);
    if (stacksError) {
      setError(LOAD_ERROR);
      return false;
    }
    setStacks(data ?? []);
    return true;
  }, [userId]);

  const fetchCompletions = useCallback(
    async (day: string) => {
      if (!userId) return true;
      completionsInFlight.current += 1;
      try {
        const { data, error: completionsError } = await supabase
          .from('habit_completions')
          .select('habit_id, status, count')
          .eq('user_id', userId)
          .eq('completed_at', day);
        // The view may have stepped to another day while this was in flight; applying a stale
        // day's rows would show (and then snapshot) the wrong ticks under the new day. The
        // fetch the day-switch issued owns the view now — discard this one. (The mutation
        // paths all guard on `viewDateRef` the same way.)
        if (viewDateRef.current !== day) return true;
        if (completionsError) {
          setError(LOAD_ERROR);
          return false;
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
        return true;
      } finally {
        completionsInFlight.current -= 1;
      }
    },
    [userId],
  );

  // Re-pull habits, stacks, and the viewed day's completions. Called on Habits-tab focus so
  // changes made outside this provider (e.g. a progress reset in Settings) appear on return —
  // the same focus-refetch the Progress tab uses.
  const refresh = useCallback(async () => {
    const results = await Promise.all([fetchHabits(), fetchStacks(), fetchCompletions(viewDateRef.current)]);
    return results.every(Boolean);
  }, [fetchHabits, fetchStacks, fetchCompletions]);

  // One full load, raced against a timeout so a hung client (a stale session, a dropped
  // socket) surfaces a retryable error instead of an endless spinner. A late-settling query
  // just refreshes the data harmlessly — and, when it fully succeeds, clears the timeout
  // banner it obsoleted (only that banner: a newer error from another op stays up).
  // Clears any prior error so a retry starts clean.
  const load = useCallback(async () => {
    setError(null);
    const work = refresh().then(
      (ok) => ok,
      () => false,
    );
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS));
    if ((await Promise.race([work, timeout])) === 'timeout') {
      setError(LOAD_ERROR);
      void work.then((ok) => {
        if (ok) setError((e) => (e === LOAD_ERROR ? null : e));
      });
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

  // Persist a snapshot of the viewed day so the next cold start paints instantly (the mount
  // load above revalidates it). Tagged with `viewDate` — the day these completion sets belong
  // to — so the seed is only trusted next launch when it's still today (see habits-cache).
  // Skipped while the first load is still in flight, so we never cache the empty pre-seed state.
  // Written on a trailing timer, not in the commit itself: the write is a synchronous
  // full-payload stringify + SQLite setItem, and every tick/step lands here — deferring it keeps
  // that cost out of the interaction's frame and coalesces a burst of taps into one write. A
  // snapshot dropped by an unmount mid-window is fine: it's a best-effort cache, revalidated on
  // every launch.
  // Also skipped while an error is up: a failed day-switch refetch leaves the completion sets
  // blanked, and caching that would seed the next cold start with "nothing done" for a day
  // that has real ticks. Best-effort — the next clean commit writes the snapshot again.
  useEffect(() => {
    if (loading || !userId || error) return;
    const timer = setTimeout(() => {
      // A completions fetch still in flight means these sets may be the blanked pre-fetch state
      // (day-switch clears them synchronously); persisting that would seed the next cold start
      // with "nothing done" for a day with real ticks. Skip — the fetch's own commit re-arms
      // this effect and writes the settled snapshot.
      if (completionsInFlight.current > 0) return;
      writeHabitsSnapshot({
        userId,
        day: viewDate,
        habits,
        stacks,
        completed: [...completed],
        skipped: [...skipped],
        counts: [...counts],
      });
    }, SNAPSHOT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loading, userId, error, viewDate, habits, stacks, completed, skipped, counts]);

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
  // Gated on `loading`: the first commit renders with `habits = []` whenever the snapshot seed
  // is rejected (every new-day launch), and syncing THAT would cancel every scheduled OS
  // reminder before the load lands — durably, if the load then fails. Sync only from loaded
  // (or seeded) state; the `loading` flip re-runs the effect once the real habits are in.
  useEffect(() => {
    if (loading) return;
    syncReminders();
  }, [loading, reminderSignature]);

  const remainingToday = useMemo(
    () => habits.filter((h) => scheduledOn(h, today) && !completed.has(h.id) && !skipped.has(h.id)).length,
    [habits, completed, skipped, today],
  );

  // Keep the home-screen app icon badge aligned with the same "open today" count shown in
  // the Habits tab badge. Scheduled notifications also set this while the app is closed.
  useEffect(() => {
    void setAppBadgeCount(userId ? remainingToday : 0);
  }, [userId, remainingToday]);

  // Unmount = leaving the authed tree (sign-out): zero the badge AND cancel the scheduled
  // reminders, so the previous user's habit-named notifications don't keep firing on the
  // sign-in screen (each would also re-set the badge this cleanup just cleared). The next
  // sign-in's provider rebuilds its own schedule once its load lands.
  useEffect(
    () => () => {
      void setAppBadgeCount(0);
      void rescheduleAll([]);
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
      // "open", so they don't hold the day back from completing — which also means
      // ticking a *previously skipped* habit can never newly close the day or its
      // stack (both were already complete without it, and already celebrated); a
      // plain done tap avoids replaying the celebration.
      if (wasDone) {
        haptics.uncompleted();
      } else if (wasSkipped) {
        haptics.completed();
      } else {
        const res = celebrateIfDayComplete(habitsRef.current, skippedRef.current, completedRef.current, habitId, day);
        if (res.dayComplete && day === todayRef.current) showDayComplete(day, res.doneIds);
        celebrateIfStackComplete(habitsRef.current, skippedRef.current, completedRef.current, habitId, day, res.dayComplete);
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
    [userId, showDayComplete],
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
      // open habit scheduled for the day (mirrors `toggleHabit`, including the was-skipped
      // gate: a skipped act never held the day or stack open, so completing it can't newly
      // close either — don't replay their celebrations).
      if (next < prevCount) {
        haptics.uncompleted();
      } else if (nowDone && !wasDone && !wasSkipped) {
        const res = celebrateIfDayComplete(habitsRef.current, skippedRef.current, completedRef.current, habitId, day);
        if (res.dayComplete && day === todayRef.current) showDayComplete(day, res.doneIds);
        celebrateIfStackComplete(habitsRef.current, skippedRef.current, completedRef.current, habitId, day, res.dayComplete);
      } else if (nowDone && !wasDone) {
        haptics.completed();
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
    [userId, showDayComplete],
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
        // Swap the temp row for the persisted one (real id) — but keep the LIVE position: a
        // reorder made while the insert was in flight moved the temp row (locally only; temp
        // ids are never persisted), and the server row still carries the stale insert-time
        // position. Swapping that in wholesale would snap the habit back to its old slot.
        const server = data as Habit;
        const livePosition = habitsRef.current.find((h) => h.id === tempId)?.position ?? server.position;
        const swapped = livePosition === server.position ? server : { ...server, position: livePosition };
        setHabits((prev) => prev.map((h) => (h.id === tempId ? swapped : h)));
        if (livePosition !== server.position) {
          void supabase.from('habits').update({ position: livePosition }).eq('id', server.id);
        }
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
        // `createStack` right after) sees the new rows before the sync effect runs.
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
        return;
      }

      // A target_count change must reconcile the viewed day's already-logged count, or the
      // day's row goes stale: lowering the target to (or below) the logged count left the row
      // 'partial' forever — full ring, unstruck label, day uncompletable (the + is disabled at
      // the clamp) — and raising it left a 'done' row below its new target. Mirrors
      // adjustHabitCount's write; silent (an edit, not a tick — no haptics, no celebration).
      if (patch.target_count === undefined) return;
      const day = viewDateRef.current;
      const newTarget = patch.target_count;
      const count = countsRef.current.get(habitId) ?? 0;
      if (skippedRef.current.has(habitId)) return; // excused for the day — nothing to reconcile
      if (newTarget == null) {
        // Count goal → binary: the running count no longer means anything on the row.
        if (count > 0) {
          setCounts((prevCounts) => {
            const next = new Map(prevCounts);
            next.delete(habitId);
            return next;
          });
        }
        return;
      }
      if (count <= 0) {
        // Binary → count with the day already ticked: the binary 'done' row (count null) would
        // render greyed-done at "0/N" with a live stepper and credit an unmet target. The old
        // tick doesn't represent N reps — reopen the day (mirrors adjustHabitCount's ≤0 delete).
        if (!completedRef.current.has(habitId)) return; // nothing logged, nothing ticked
        setCompleted((prevDone) => {
          const nextDone = new Set(prevDone);
          nextDone.delete(habitId);
          return nextDone;
        });
        try {
          await deleteCompletion(habitId, day);
        } catch {
          if (viewDateRef.current === day) {
            setCompleted((prevDone) => new Set(prevDone).add(habitId));
          }
          setError(UPDATE_ERROR);
        }
        return;
      }
      const clamped = Math.min(count, newTarget);
      const nowDone = clamped >= newTarget;
      const wasDone = completedRef.current.has(habitId);
      if (clamped === count && nowDone === wasDone) return; // row already consistent
      if (clamped !== count) {
        setCounts((prevCounts) => new Map(prevCounts).set(habitId, clamped));
      }
      if (nowDone !== wasDone) {
        setCompleted((prevDone) => {
          const next = new Set(prevDone);
          if (nowDone) next.add(habitId);
          else next.delete(habitId);
          return next;
        });
      }
      try {
        await upsertCompletion({
          habit_id: habitId,
          user_id: userId,
          completed_at: day,
          count: clamped,
          status: nowDone ? 'done' : 'partial',
        });
      } catch {
        // The day may have changed mid-flight; only roll back if we're still on it.
        if (viewDateRef.current === day) {
          if (clamped !== count) {
            setCounts((prevCounts) => new Map(prevCounts).set(habitId, count));
          }
          if (nowDone !== wasDone) {
            setCompleted((prevDone) => {
              const next = new Set(prevDone);
              if (wasDone) next.add(habitId);
              else next.delete(habitId);
              return next;
            });
          }
        }
        setError(UPDATE_ERROR);
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
    async (
      name: string,
      orderedMemberIds: string[],
      opts?: { stackId?: string; moment?: MomentKey | null },
    ): Promise<string | null> => {
      if (!userId) return null;
      const cleanName = name.trim();
      const memberIds = orderedMemberIds.filter((id) => !id.startsWith('temp-'));
      if (!cleanName) return null;
      // An explicitly-empty list creates an empty stack (the "+ → New stack" flow); a list
      // that only *became* empty by filtering temp- ids still bails (nothing real to group).
      if (orderedMemberIds.length > 0 && memberIds.length === 0) return null;

      try {
        await ensureUserRow();
      } catch {
        setError(ACCOUNT_SETUP_ERROR);
        return null;
      }

      const prevHabits = habitsRef.current;

      // Client-minted id so the card can appear this frame — no round-trip to read a server id, and
      // no temp→real id swap (a swap would remount the card and re-fire its entrance animation). The
      // insert below reuses this id. This keeps drag-to-merge instant: the two rows fold into a card
      // the moment the ghost lands, instead of flashing back to standalone during the insert. A caller
      // that pre-minted the id (to target the card as it appears) passes it through.
      const stackId = opts?.stackId ?? newId();
      const moment = opts?.moment ?? null;
      const stack: HabitStack = {
        id: stackId,
        user_id: userId,
        name: cleanName,
        moment,
        // day_part keeps holding the derived band, so everything banded downstream is unchanged.
        day_part: momentBand(moment),
        created_at: null,
        updated_at: null,
      };

      // Pull members together (in order) and stamp their stack_id, optimistically.
      const orderIds = groupedOrder(prevHabits, memberIds);
      const memberSet = new Set(memberIds);
      const byId = new Map(prevHabits.map((h) => [h.id, h]));
      const next = orderIds
        .map((id, index) => {
          const h = byId.get(id);
          return h ? { ...h, position: index, stack_id: memberSet.has(id) ? stackId : h.stack_id } : null;
        })
        .filter((h): h is Habit => h !== null);
      setStacks((prev) => [...prev, stack]);
      setHabits(next);
      // Keep the ref authoritative immediately (mirrors `createHabits`), so stack creates
      // chained back-to-back (the starter stacks) each see the previous one's positions.
      habitsRef.current = next;

      // DB writes, correctly ordered: the stack row must exist before members' stack_id FK points at it.
      try {
        const { error: insErr } = await supabase
          .from('habit_stacks')
          .insert({ id: stackId, user_id: userId, name: cleanName, moment, day_part: momentBand(moment) });
        if (insErr) throw insErr;
      } catch {
        setHabits(prevHabits);
        habitsRef.current = prevHabits;
        // Remove just the stack this op added — not a wholesale prevStacks restore, which
        // would clobber any unrelated stack op that landed while the insert was in flight.
        setStacks((cur) => cur.filter((s) => s.id !== stackId));
        setError('Could not create that stack. Check your connection.');
        return null;
      }

      const ok = await persistGrouping(next, prevHabits);
      if (!ok) {
        // persistGrouping already rolled the habits back; undo the stack shell too (local + remote).
        habitsRef.current = prevHabits;
        setStacks((cur) => cur.filter((s) => s.id !== stackId));
        void supabase.from('habit_stacks').delete().eq('id', stackId);
        setError('Could not create that stack. Check your connection.');
        return null;
      }
      return stackId;
    },
    [userId, ensureUserRow, persistGrouping],
  );

  const deleteStack = useCallback(
    async (stackId: string) => {
      if (!userId) return;
      const prevHabits = habitsRef.current;
      const prevStacks = stacksRef.current;
      if (!prevStacks.some((s) => s.id === stackId)) return;

      // Optimistic: drop the stack; members revert to standalone. The ref is synced
      // immediately (mirrors createStack/createHabits) so an op chained right after — the
      // merge toast's Undo runs deleteStack + reorderHabits back-to-back — reads the cleared
      // stack_ids instead of re-stamping the deleted stack's id from the stale ref (which left
      // a phantom unit that silently swallowed drag-reorders until the next refetch).
      const next = prevHabits.map((h) => (h.stack_id === stackId ? { ...h, stack_id: null } : h));
      setStacks((prev) => prev.filter((s) => s.id !== stackId));
      setHabits(next);
      habitsRef.current = next;

      try {
        const { error: delErr } = await supabase.from('habit_stacks').delete().eq('id', stackId);
        if (delErr) throw delErr;
        // Members' stack_id is cleared by the FK (on delete set null).
      } catch {
        setHabits(prevHabits);
        habitsRef.current = prevHabits;
        setStacks(prevStacks);
        setError('Could not delete that stack. Check your connection.');
      }
    },
    [userId],
  );

  const updateStack = useCallback(
    async (stackId: string, patch: { name?: string; orderedMemberIds?: string[]; moment?: MomentKey | null }) => {
      if (!userId) return;
      const prevHabits = habitsRef.current;
      const prevStacks = stacksRef.current;
      if (!prevStacks.some((s) => s.id === stackId)) return;

      const newName = patch.name?.trim();
      // `moment` present-and-null is an explicit un-anchor; absent leaves the anchor alone.
      const hasMoment = 'moment' in patch;
      const memberIds = patch.orderedMemberIds?.filter((id) => !id.startsWith('temp-'));

      // No members left → the stack is meaningless; delete it.
      if (memberIds && memberIds.length === 0) {
        await deleteStack(stackId);
        return;
      }

      const rowPatch: { name?: string; moment?: MomentKey | null; day_part?: DayPart | null } = {};
      if (newName) rowPatch.name = newName;
      if (hasMoment) {
        rowPatch.moment = patch.moment ?? null;
        rowPatch.day_part = momentBand(patch.moment ?? null);
      }
      const hasRowPatch = Boolean(newName) || hasMoment;

      if (hasRowPatch) {
        setStacks((prev) => prev.map((s) => (s.id === stackId ? { ...s, ...rowPatch } : s)));
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
        if (hasRowPatch) {
          const { error: rowErr } = await supabase.from('habit_stacks').update(rowPatch).eq('id', stackId);
          if (rowErr) throw rowErr;
        }
        if (memberIds && !(await persistGrouping(next, prevHabits))) {
          // persistGrouping rolled the habits back. The row patch (name/moment) already
          // succeeded server-side, so the local stacks keep it — reverting would show a
          // name the server no longer has.
          setError('Could not save the stack. Check your connection.');
        }
      } catch {
        setHabits(prevHabits);
        // The row update failed: revert just this stack's row patch (a wholesale prevStacks
        // restore would clobber unrelated concurrent stack ops).
        if (hasRowPatch) {
          const prevRow = prevStacks.find((s) => s.id === stackId);
          if (prevRow) setStacks((cur) => cur.map((s) => (s.id === stackId ? prevRow : s)));
        }
        setError('Could not save the stack. Check your connection.');
      }
    },
    [userId, deleteStack, persistGrouping],
  );

  // Move a single habit into a stack, out to the top level, or to a new slot within its
  // stack — membership + full re-position in ONE optimistic update and one persisted batch
  // (`orderAfterHabitMove` rebuilds the whole order with stack members kept contiguous). If the
  // move empties the habit's former stack, that now-memberless shell is deleted (unless the
  // caller asks to keep it — see `keepEmptyShell` on the context type).
  const moveHabit = useCallback(
    async (
      habitId: string,
      target: { toStackId: string | null; placement?: MovePlacement; keepEmptyShell?: boolean },
    ) => {
      if (!userId) return;
      const prevHabits = habitsRef.current;
      const prevStacks = stacksRef.current;
      const habit = prevHabits.find((h) => h.id === habitId);
      if (!habit || habit.id.startsWith('temp-')) return;
      const { toStackId } = target;
      if (toStackId && !prevStacks.some((s) => s.id === toStackId)) return; // stale drop target
      // Same stack with no explicit placement = already where it's going; WITH a placement it's
      // a reorder within the stack (a legitimate move).
      if ((habit.stack_id ?? null) === toStackId && !target.placement) return;

      const fromStackId = habit.stack_id ?? null;
      let placement: MovePlacement =
        target.placement ??
        (toStackId
          ? { type: 'member-append' }
          : fromStackId
            ? { type: 'after-unit', key: `stack:${fromStackId}` } // "Remove" lands right after its old card
            : { type: 'before-unit', key: null });
      // A first member entering an empty anchored stack births the card's place in the list:
      // land the new unit at its day-order slot (the newcomer joins the day sequence; nothing
      // else moves, and any drag afterwards still wins). Only the blind "append" default is
      // upgraded — a geometric placement from the drag layer is never overridden.
      if (toStackId && placement.type === 'member-append' && !prevHabits.some((h) => h.stack_id === toStackId)) {
        const toStack = prevStacks.find((s) => s.id === toStackId);
        const slot = toStack ? dayOrderPlacement(prevHabits, prevStacks, momentOf(toStack)) : null;
        if (slot) placement = slot;
      }

      const { orderedIds } = orderAfterHabitMove(prevHabits, habitId, toStackId, placement);
      const byId = new Map(prevHabits.map((h) => [h.id, h]));
      const next = orderedIds
        .map((id, index) => {
          const h = byId.get(id);
          if (!h) return null;
          return { ...h, position: index, stack_id: id === habitId ? toStackId : h.stack_id };
        })
        .filter((h): h is Habit => h !== null);
      if (next.length !== prevHabits.length) return; // unknown id crept in — bail rather than corrupt

      const emptyStackId =
        !target.keepEmptyShell && fromStackId && !next.some((h) => h.stack_id === fromStackId)
          ? fromStackId
          : null;

      setHabits(next);
      if (emptyStackId) setStacks((prev) => prev.filter((s) => s.id !== emptyStackId));

      // On failure, restore only the shell this move removed — a wholesale prevStacks
      // restore would clobber unrelated concurrent stack ops.
      const restoreShell = () => {
        const shell = prevStacks.find((s) => s.id === emptyStackId);
        if (shell) setStacks((cur) => (cur.some((s) => s.id === shell.id) ? cur : [...cur, shell]));
      };
      if (!(await persistGrouping(next, prevHabits))) {
        if (emptyStackId) restoreShell();
        setError('Could not move that habit. Check your connection.');
        return;
      }
      if (emptyStackId) {
        const { error: delErr } = await supabase.from('habit_stacks').delete().eq('id', emptyStackId);
        // The move itself stands; a failed shell delete just leaves the empty stack in place
        // (it still exists in the DB) — the next emptying move will retry the cleanup.
        if (delErr) restoreShell();
      }
    },
    [userId, persistGrouping],
  );

  // Create-into-a-stack is the two proven mutations chained (not a stack_id on the insert):
  // `createHabits` syncs `habitsRef` on resolve, so the follow-up move sees the fresh row, and
  // `moveHabit` keeps the position space contiguous. The one-frame standalone hop sits behind
  // the Add modal, so it is never visible on Today.
  const createHabitInStack = useCallback(
    async (input: HabitCreate, stackId: string) => {
      const [habit] = await createHabits([input]);
      if (!habit) return; // createHabits already surfaced the error
      if (!stacksRef.current.some((s) => s.id === stackId)) return; // stack gone — habit stays standalone
      await moveHabit(habit.id, { toStackId: stackId, placement: { type: 'member-append' } });
    },
    [createHabits, moveHabit],
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
      remainingToday,
      dismissError,
      refresh,
      reload,
      setViewDate,
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
      moveHabit,
      createHabitInStack,
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
    remainingToday,
    dismissError,
    refresh,
    reload,
    setViewDate,
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
    moveHabit,
    createHabitInStack,
  ]);

  return <HabitsContext value={value}>{children}</HabitsContext>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within a HabitsProvider');
  return ctx;
}
