import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import type { Habit } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { computeGoals, type Goal, type GoalAct, type GoalReading } from '@/lib/goals';
import { supabase } from '@/lib/supabase';

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
};

/** What the goal screen may change. The engine is fixed at creation: an act can be edited or
 *  deleted like any other habit, but re-attaching one to a goal has no surface yet, so a goal
 *  that loses every act is set again rather than repaired (its screen says so). */
export type GoalPatch = Partial<Pick<Goal, 'title' | 'unit' | 'target_value' | 'milestone_step' | 'horizon_on' | 'obstacle' | 'if_then' | 'status'>>;

type GoalsContextValue = {
  goals: Goal[];
  /** Every goal's engine, flat — `computeGoals` filters by goal id. */
  goalActs: GoalAct[];
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  createGoal: (input: GoalCreate) => Promise<Goal | null>;
  updateGoal: (goalId: string, patch: GoalPatch) => Promise<boolean>;
  deleteGoal: (goalId: string) => Promise<boolean>;
  refresh: () => Promise<boolean>;
};

const GoalsContext = createContext<GoalsContextValue | null>(null);

export function useGoals(): GoalsContextValue {
  const value = useContext(GoalsContext);
  if (!value) throw new Error('useGoals must be used within a GoalsProvider');
  return value;
}

export function GoalsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<Goal[]>([]);
  const [acts, setActs] = useState<GoalAct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rowsRef = useLatestRef(rows);
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
      setError(null);
      return true;
    }
    const [goalsRes, actsRes] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', userId).order('position', { ascending: true }),
      supabase.from('goal_acts').select('*').eq('user_id', userId),
    ]);
    if (userRef.current !== userId) return true; // superseded mid-flight — discard, don't write
    if (goalsRes.error || actsRes.error) {
      setError(LOAD_ERROR);
      return false;
    }
    const kept = (goalsRes.data ?? []).filter((goal) => !deletedIds.current.has(goal.id));
    setRows(kept);
    // A goal deleted this session takes its engine rows with it by cascade, but the same race
    // applies to the second query — so they are filtered against the surviving goals rather than
    // against the deleted set, which is the same rule stated once.
    const live = new Set(kept.map((goal) => goal.id));
    setActs((actsRes.data ?? []).filter((act) => live.has(act.goal_id)));
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
        })
        .select()
        .single();
      if (insError || !data) {
        setError('Could not add that goal. Check your connection.');
        return null;
      }

      // The engine second. A goal with no acts is a legible state — its screen says nothing is
      // driving it — so a failure here leaves something the user can repair rather than an
      // orphaned half-write they cannot see. (The library learned this the hard way writing
      // habits before their stack: a rejected stack stranded the acts under a success toast.)
      let engine: GoalAct[] = [];
      if (input.acts.length > 0) {
        const { data: actRows, error: actError } = await supabase
          .from('goal_acts')
          .insert(input.acts.map((a) => ({ goal_id: data.id, habit_id: a.habitId, user_id: userId, contributes: a.contributes })))
          .select();
        if (actError) setError('The goal was saved, but its acts were not attached. Open it to add them.');
        engine = actRows ?? [];
      }

      setRows((prev) => [...prev, data]);
      rowsRef.current = [...rowsRef.current, data];
      setActs((prev) => [...prev, ...engine]);
      return data;
    },
    [userId, rowsRef],
  );

  const updateGoal = useCallback(
    async (goalId: string, patch: GoalPatch): Promise<boolean> => {
      const { data, error: updError } = await supabase.from('goals').update(patch).eq('id', goalId).select().single();
      if (updError || !data) {
        setError(SAVE_ERROR);
        return false;
      }
      setRows((prev) => prev.map((goal) => (goal.id === goalId ? data : goal)));
      rowsRef.current = rowsRef.current.map((goal) => (goal.id === goalId ? data : goal));
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
      // `goal_acts` cascades in the database; this keeps the client from carrying the orphans
      // until the next fetch.
      setActs((prev) => prev.filter((act) => act.goal_id !== goalId));
      return true;
    },
    [rowsRef],
  );

  const value = useMemo(
    () => ({ goals: rows, goalActs: acts, loading, error, dismissError, createGoal, updateGoal, deleteGoal, refresh: fetchGoals }),
    [rows, acts, loading, error, dismissError, createGoal, updateGoal, deleteGoal, fetchGoals],
  );

  return <GoalsContext value={value}>{children}</GoalsContext>;
}

/**
 * A one-shot read of the goals, for callers outside the navigator — the lunar-update arming, which
 * runs as the app goes to the background and has no provider above it. The sibling of
 * {@link import('./use-progress').loadProgress}, and it exists for the same reason.
 *
 * It fetches the whole record for the engine acts rather than a window, and that is not optional:
 * a goal's measure is a lifetime sum, so a 370-day window would report a twenty-year ḥifẓ as
 * barely begun and quote a monthly quota several times too large on a lock screen. The query is
 * narrowed to the habits some goal actually drives instead, which is a handful of rows a day at
 * worst — the cost of the window, without its error.
 *
 * Returns an empty list on any failure. A notification that has lost its figure still has its
 * landmark, and the copy already knows how to drop one.
 */
export async function loadGoalReadings(userId: string, today: string): Promise<GoalReading[]> {
  const [goalsRes, actsRes] = await Promise.all([
    supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'open'),
    supabase.from('goal_acts').select('*').eq('user_id', userId),
  ]);
  const goals = goalsRes.data ?? [];
  const acts = (actsRes.data ?? []).filter((act) => goals.some((goal) => goal.id === act.goal_id));
  if (goals.length === 0 || acts.length === 0) return [];

  const habitIds = [...new Set(acts.map((act) => act.habit_id))];
  const [habitsRes, completionsRes] = await Promise.all([
    supabase.from('habits').select('*').in('id', habitIds),
    supabase.from('habit_completions').select('habit_id, completed_at, status, count').in('habit_id', habitIds),
  ]);
  if (habitsRes.error || completionsRes.error) return [];
  // The same narrowing `use-progress` applies on its own fetch: the generated row type carries
  // `hijri_schedule` as `Json`, and every consumer in the app reads it as a `HijriSchedule`.
  return computeGoals(goals, acts, (habitsRes.data ?? []) as Habit[], completionsRes.data ?? [], today);
}
