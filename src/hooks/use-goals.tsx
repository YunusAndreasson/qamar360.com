import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useDayComplete } from '@/components/day-complete';
import { useAuth } from '@/hooks/use-auth';
import { useHabitsTaskBridge } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { askingGoals, openCountOn, type GoalCheckIn } from '@/lib/check-ins';
import type { Tables } from '@/lib/database.types';
import { dayCloseAfter, moonLitFor, openTasksOn, setOpenCheckInsProbe } from '@/lib/day-close';
import type { Goal, GoalAct } from '@/lib/goals';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * The generated row type carries the cadence's Hijri schedule as `Json`; `Goal` narrows it, and
 * this is the one place the narrowing happens — the same treatment `Habit` gives
 * `hijri_schedule`. Every screen downstream then reads a {@link HijriSchedule} without a cast.
 */
const asGoals = (rows: Tables<'goals'>[]): Goal[] => rows as Goal[];

/**
 * The goals — a horizon over acts you already keep.
 *
 * This provider owns the two stored tables and nothing else. Every figure a goal is read by is
 * derived from the record, and the record already arrives on the Progress tab, so the arithmetic
 * lives in `use-progress` beside the month and the readings ({@link import('@/lib/goals')}).
 * Splitting it that way keeps this file to what it actually is — a small list with four writes —
 * and means a goal spanning twenty years costs no query of its own.
 *
 * Modelled on {@link import('./use-plans').PlansProvider}, down to the deleted-id guard: a goal is
 * deleted from its own screen, which pops to a list that refetches on focus, and that SELECT can
 * beat the DELETE to the server. Writes await rather than painting optimistically, for the same
 * reason plans do — each one is made from a form with a Save, or from a row that then navigates.
 */

const LOAD_ERROR = 'Could not load your goals. Check your connection and try again.';
const SAVE_ERROR = 'Could not save that. Check your connection.';

/** What the composer supplies. Everything else on the row is defaulted or derived. */
export type GoalCreate = {
  title: string;
  unit: string;
  target_value: number;
  milestone_step: number | null;
  horizon_on: string;
  obstacle: string;
  if_then: string;
  /** The engine, as habit ids already created: which acts drive it, and which move the number. */
  acts: { habitId: string; contributes: boolean }[];
  /** The cadence it asks on, when it asks at all. */
  cadence?: Pick<Goal, 'check_in_days' | 'check_in_hijri' | 'check_in_from'>;
  /**
   * Where the goal stands today, written as its first reading. It is also what settles
   * `direction`: a starting value above the target means the measure has to come down.
   */
  startValue?: number;
};

/** What the goal screen may change. The engine is fixed at creation: an act can be edited or
 *  deleted like any other habit, but re-attaching one to a goal has no surface yet, so a goal
 *  that loses every act is set again rather than repaired (its screen says so). */
export type GoalPatch = Partial<
  Pick<
    Goal,
    | 'title'
    | 'unit'
    | 'target_value'
    | 'milestone_step'
    | 'horizon_on'
    | 'obstacle'
    | 'if_then'
    | 'status'
    | 'check_in_days'
    | 'check_in_hijri'
    | 'check_in_from'
    | 'direction'
  >
>;

/** What one check-in records. The day is the identity — a second answer on it is a correction. */
export type CheckInInput = { takenOn: string; value: number; note: string };

type GoalsContextValue = {
  goals: Goal[];
  /** Every goal's engine, flat — `computeGoals` filters by goal id. */
  goalActs: GoalAct[];
  /** Every reading this user has given, oldest first — unwindowed, see {@link fetchGoals}. */
  checkIns: GoalCheckIn[];
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  createGoal: (input: GoalCreate) => Promise<Goal | null>;
  updateGoal: (goalId: string, patch: GoalPatch) => Promise<boolean>;
  deleteGoal: (goalId: string) => Promise<boolean>;
  /** Answer a goal's check-in. Upserts on the day, so answering twice corrects rather than doubles. */
  saveCheckIn: (goalId: string, input: CheckInInput) => Promise<boolean>;
  deleteCheckIn: (checkInId: string) => Promise<boolean>;
  refresh: () => Promise<boolean>;
};

const GoalsContext = createContext<GoalsContextValue | null>(null);
const GoalCheckInsSummaryContext = createContext<{ openToday: number } | null>(null);

export function useGoals(): GoalsContextValue {
  const value = useContext(GoalsContext);
  if (!value) throw new Error('useGoals must be used within a GoalsProvider');
  return value;
}

/** The one goals value tab chrome needs, without subscribing it to the goal collection. */
export function useGoalCheckInsSummary(): { openToday: number } {
  const value = useContext(GoalCheckInsSummaryContext);
  if (!value) throw new Error('useGoalCheckInsSummary must be used within a GoalsProvider');
  return value;
}

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // The day and the habits state a closing day is judged against. `GoalsProvider` is a descendant
  // of `HabitsProvider`, so answering a check-in can decide the day's close for itself; the
  // reverse direction — a seal asking whether a goal is still waiting — goes through the probe in
  // `lib/day-close.ts`. Open to-dos are read through their probe for the same reason.
  const { today, getDayCloseSnapshot } = useHabitsTaskBridge();
  const { celebrate: showDayComplete } = useDayComplete();

  const [rows, setRows] = useState<Goal[]>([]);
  const [acts, setActs] = useState<GoalAct[]>([]);
  const [checkIns, setCheckIns] = useState<GoalCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rowsRef = useLatestRef(rows);
  const checkInsRef = useLatestRef(checkIns);
  const todayRef = useLatestRef(today);
  const deletedIds = useRef<Set<string>>(new Set());
  /** The user this provider currently serves. A fetch that lands after a sign-out or an account
   *  switch must neither be kept nor written — the same guard `use-progress` keeps, and without
   *  it one account's goals stay on screen under another's name. */
  const userRef = useLatestRef(userId);

  const fetchGoals = useCallback(async () => {
    if (!userId) {
      // Signed out: the rows belong to whoever just left, so they go with them.
      setRows([]);
      setActs([]);
      setCheckIns([]);
      setError(null);
      return true;
    }
    // The readings are fetched whole rather than windowed, and that is not an oversight: the first
    // one a goal ever took is its baseline, and a goal's measure is a lifetime series. It is the
    // same call `use-progress` already makes for every completion ever written, over a table with
    // far fewer rows in it.
    const [goalsRes, actsRes, checkInsRes] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', userId).order('position', { ascending: true }),
      supabase.from('goal_acts').select('*').eq('user_id', userId),
      supabase.from('goal_check_ins').select('*').eq('user_id', userId).order('taken_on', { ascending: true }),
    ]);
    if (userRef.current !== userId) return true; // superseded mid-flight — discard, don't write
    if (goalsRes.error || actsRes.error || checkInsRes.error) {
      setError(LOAD_ERROR);
      return false;
    }
    const kept = asGoals(goalsRes.data ?? []).filter((goal) => !deletedIds.current.has(goal.id));
    setRows(kept);
    // A goal deleted this session takes its engine rows and its readings with it by cascade, but
    // the same race applies to the other two queries — so they are filtered against the surviving
    // goals rather than against the deleted set, which is the same rule stated once.
    const live = new Set(kept.map((goal) => goal.id));
    setActs((actsRes.data ?? []).filter((act) => live.has(act.goal_id)));
    setCheckIns((checkInsRes.data ?? []).filter((row) => live.has(row.goal_id)));
    setError(null);
    return true;
  }, [userId, userRef]);

  // The `void (async …)()` shape rather than a bare `setState` in the effect body, which the
  // React Compiler's lint rejects.
  useEffect(() => {
    let active = true;
    deletedIds.current.clear(); // ids are per-account; a new user's row must never be filtered out
    void (async () => {
      await fetchGoals();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchGoals]);

  const dismissError = useCallback(() => setError(null), []);

  const createGoal = useCallback(
    async (input: GoalCreate): Promise<Goal | null> => {
      if (!userId) return null;
      const title = input.title.trim();
      const unit = input.unit.trim();
      if (!title || !unit || !(input.target_value > 0)) return null;
      const position = rowsRef.current.reduce((max, goal) => Math.max(max, goal.position), -1) + 1;

      // Which way the measure travels, settled here and never asked. A starting value above the
      // target means the number has to come down; with no starting value there is nothing to
      // travel from, so it defaults to climbing exactly as every goal did before this existed.
      const direction = input.startValue !== undefined && input.startValue > input.target_value ? 'down' : 'up';

      const { data, error: insError } = await supabase
        .from('goals')
        .insert({
          user_id: userId,
          title,
          unit,
          target_value: input.target_value,
          milestone_step: input.milestone_step,
          horizon_on: input.horizon_on,
          obstacle: input.obstacle.trim(),
          if_then: input.if_then.trim(),
          position,
          direction,
          ...(input.cadence ?? {}),
        })
        .select()
        .single();
      if (insError || !data) {
        setError('Could not add that goal. Check your connection.');
        return null;
      }
      const goal = asGoals([data])[0]!;

      // The starting reading, written the same way and for the same reason as the engine below:
      // separately, and after the row it belongs to exists. A goal that failed to record where it
      // started is a goal waiting for its first check-in, which is a state its screen already
      // knows how to say.
      let firstReading: GoalCheckIn | null = null;
      if (input.startValue !== undefined) {
        const { data: readingRow } = await supabase
          .from('goal_check_ins')
          .insert({ goal_id: goal.id, user_id: userId, taken_on: todayRef.current, value: input.startValue, note: '' })
          .select()
          .single();
        firstReading = readingRow ?? null;
      }

      // The engine second. A goal with no acts is a legible state — its screen says nothing is
      // driving it — so a failure here leaves something the user can repair rather than an
      // orphaned half-write they cannot see. (The library learned this the hard way writing
      // habits before their stack: a rejected stack stranded the acts under a success toast.)
      let engine: GoalAct[] = [];
      if (input.acts.length > 0) {
        const { data: actRows, error: actError } = await supabase
          .from('goal_acts')
          .insert(input.acts.map((a) => ({ goal_id: goal.id, habit_id: a.habitId, user_id: userId, contributes: a.contributes })))
          .select();
        if (actError) setError('The goal was saved, but its acts were not attached. Open it to add them.');
        engine = actRows ?? [];
      }

      setRows((prev) => [...prev, goal]);
      rowsRef.current = [...rowsRef.current, goal];
      setActs((prev) => [...prev, ...engine]);
      if (firstReading) setCheckIns((prev) => [...prev, firstReading]);
      return goal;
    },
    [userId, rowsRef, todayRef],
  );

  const updateGoal = useCallback(
    async (goalId: string, patch: GoalPatch): Promise<boolean> => {
      const { data, error: updError } = await supabase.from('goals').update(patch).eq('id', goalId).select().single();
      if (updError || !data) {
        setError(SAVE_ERROR);
        return false;
      }
      const next = asGoals([data])[0]!;
      setRows((prev) => prev.map((goal) => (goal.id === goalId ? next : goal)));
      rowsRef.current = rowsRef.current.map((goal) => (goal.id === goalId ? next : goal));
      return true;
    },
    [rowsRef],
  );

  const deleteGoal = useCallback(
    async (goalId: string): Promise<boolean> => {
      deletedIds.current.add(goalId);
      const { error: delError } = await supabase.from('goals').delete().eq('id', goalId);
      if (delError) {
        deletedIds.current.delete(goalId);
        setError('Could not delete that goal. Check your connection.');
        return false;
      }
      setRows((prev) => prev.filter((goal) => goal.id !== goalId));
      rowsRef.current = rowsRef.current.filter((goal) => goal.id !== goalId);
      // `goal_acts` and `goal_check_ins` cascade in the database; this keeps the client from
      // carrying the orphans until the next fetch.
      setActs((prev) => prev.filter((act) => act.goal_id !== goalId));
      setCheckIns((prev) => prev.filter((row) => row.goal_id !== goalId));
      return true;
    },
    [rowsRef],
  );

  /**
   * Answer a goal's check-in.
   *
   * Upserted on `(goal_id, taken_on)`: the day is the reading's identity, so answering twice on
   * one day corrects the first rather than laying a second point on top of it. Awaited rather
   * than painted optimistically, like every other write here — it is made from a form with a Save.
   *
   * The last thing it does is ask whether the day just closed, which is the seam a to-do's tick
   * has and for the same reason: a check-in can hold the day open, so answering the last one
   * has to be able to let it go.
   */
  const saveCheckIn = useCallback(
    async (goalId: string, input: CheckInInput): Promise<boolean> => {
      if (!userId) return false;
      if (!Number.isFinite(input.value)) return false;
      const { data, error: saveError } = await supabase
        .from('goal_check_ins')
        .upsert(
          { goal_id: goalId, user_id: userId, taken_on: input.takenOn, value: input.value, note: input.note.trim() },
          { onConflict: 'goal_id,taken_on' },
        )
        .select()
        .single();
      if (saveError || !data) {
        setError(SAVE_ERROR);
        return false;
      }

      const applied = [...checkInsRef.current.filter((row) => row.id !== data.id && !sameDay(row, data)), data];
      setCheckIns(applied);
      checkInsRef.current = applied;

      const day = input.takenOn;
      const snapshot = getDayCloseSnapshot();
      const close = dayCloseAfter(
        snapshot.habits,
        snapshot.skipped,
        snapshot.completed,
        new Set<string>(),
        day,
        openTasksOn(day),
        openCountOn(askingGoals(rowsRef.current), applied, day, todayRef.current),
      );
      if (close.dayComplete) {
        haptics.celebrate(moonLitFor(day));
        if (day === todayRef.current) showDayComplete(day, close.doneIds);
      } else {
        // One crisp confirm, never the seal's rounder tail beat — that one means "a group settled
        // together", and a reading is one claim standing on its own.
        haptics.completed();
      }
      return true;
    },
    [userId, checkInsRef, rowsRef, todayRef, getDayCloseSnapshot, showDayComplete],
  );

  const deleteCheckIn = useCallback(
    async (checkInId: string): Promise<boolean> => {
      const { error: delError } = await supabase.from('goal_check_ins').delete().eq('id', checkInId);
      if (delError) {
        setError('Could not remove that reading. Check your connection.');
        return false;
      }
      const applied = checkInsRef.current.filter((row) => row.id !== checkInId);
      setCheckIns(applied);
      checkInsRef.current = applied;
      return true;
    },
    [checkInsRef],
  );

  // Publish "how many goals are still waiting to be told where they stand" for the day-close rule
  // in `lib/day-close.ts`. Registered once and reading refs, so it always answers from current
  // state without re-arming.
  useEffect(
    () => setOpenCheckInsProbe((day) => openCountOn(askingGoals(rowsRef.current), checkInsRef.current, day, todayRef.current)),
    [rowsRef, checkInsRef, todayRef],
  );

  const openToday = useMemo(() => openCountOn(askingGoals(rows), checkIns, today, today), [rows, checkIns, today]);

  const value = useMemo(
    () => ({
      goals: rows,
      goalActs: acts,
      checkIns,
      loading,
      error,
      dismissError,
      createGoal,
      updateGoal,
      deleteGoal,
      saveCheckIn,
      deleteCheckIn,
      refresh: fetchGoals,
    }),
    [
      rows,
      acts,
      checkIns,
      loading,
      error,
      dismissError,
      createGoal,
      updateGoal,
      deleteGoal,
      saveCheckIn,
      deleteCheckIn,
      fetchGoals,
    ],
  );
  const summaryValue = useMemo(() => ({ openToday }), [openToday]);

  return (
    <GoalCheckInsSummaryContext value={summaryValue}>
      <GoalsContext value={value}>{children}</GoalsContext>
    </GoalCheckInsSummaryContext>
  );
}

/** Two readings for the same goal on the same day are the same reading — see the unique index. */
function sameDay(a: GoalCheckIn, b: GoalCheckIn): boolean {
  return a.goal_id === b.goal_id && a.taken_on === b.taken_on;
}
