import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useDayComplete } from '@/components/day-complete';
import { useAuth } from '@/hooks/use-auth';
import { useHabitsTaskBridge } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { todayLocalISO } from '@/lib/dates';
import { dayCloseAfter, moonLitFor, openCheckInsOn, setOpenTasksProbe } from '@/lib/day-close';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { isOpen, openCountOn, visibleTasks, type Task } from '@/lib/tasks';
import { readTasksSnapshot, writeTasksSnapshot } from '@/lib/tasks-cache';

/**
 * The day's one-off tasks — the third thing a day contains, beside the stacks you keep and the
 * exchanges you hold.
 *
 * Its own provider, and its own table, because a task earns no degrees: see `lib/tasks.ts` for why
 * folding one into `habits` would rewrite the rates of months already closed. Everything here is
 * modelled on the completion paths in {@link import('./use-habits').HabitsProvider} — optimistic
 * write, one in-flight mutation per row, and a rollback that only fires if the viewed day hasn't
 * moved on underneath it.
 *
 * Mounted *inside* `HabitsProvider`, which owns the day (`viewDate`, `today`, the midnight
 * rollover) and the habits state this needs to know whether a tick just closed the day. The one
 * thing flowing the other way — "are there tasks still open?" — goes through the probe in
 * `lib/day-close.ts`, because a parent can't read its child's context.
 */

const LOAD_ERROR = 'Could not load your to-dos. Check your connection and try again.';
const SAVE_ERROR = 'Could not save that. Check your connection.';

/** Trailing delay before persisting the cold-start snapshot — the habits provider's rationale. */
const SNAPSHOT_DEBOUNCE_MS = 400;

type TasksContextValue = {
  /** The tasks to show on the viewed day, open ones first (see `lib/tasks.visibleTasks`). */
  tasks: Task[];
  /** How many are still open on the *real* today — the tab badge's share of the day. */
  openToday: number;
  /**
   * Every open to-do there is, unfiltered by day — including the ones dated ahead, which `tasks`
   * deliberately leaves out because they belong to their own day and no other. The head of Today
   * reads this to name what tomorrow is holding, since the day view cannot be walked forward to
   * go and look.
   */
  openTasks: Task[];
  /** True only until the first load settles (false immediately when a snapshot seeded it). */
  loading: boolean;
  /** Plain-language message for the last failure, or null. */
  error: string | null;
  dismissError: () => void;
  /**
   * Write a new task. Blank titles are ignored; the answer says whether it was persisted, so a
   * caller that navigates away can wait for the row rather than racing its own refetch.
   *
   * `day` defaults to the viewed day, which is every existing caller. A plan passes tomorrow, and
   * its own id, so the plan can afterwards say where the to-do went.
   */
  createTask: (title: string, options?: { day?: string; planId?: string }) => Promise<boolean>;
  /**
   * Plan id → the `due_on` of the earliest open to-do pulled from that plan, for the label a plan
   * wears once something has come out of it.
   *
   * Derived from the rows already in memory rather than queried: `fetchTasks` asks for every open
   * task there is, not just the viewed day's, so a to-do sitting on tomorrow is already here.
   */
  scheduledPlans: Map<string, string>;
  /** Tick it, or put it back on the list. */
  toggleTask: (taskId: string) => Promise<void>;
  /** Rewrite a task's title (the long-press edit). */
  renameTask: (taskId: string, title: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  /** Re-pull the viewed day (the Today tab's pull-to-refresh rides along with the habits one). */
  refresh: () => Promise<boolean>;
};

const TasksContext = createContext<TasksContextValue | null>(null);
const TasksSummaryContext = createContext<{ openToday: number } | null>(null);

export function useTasks(): TasksContextValue {
  const value = useContext(TasksContext);
  if (!value) throw new Error('useTasks must be used within a TasksProvider');
  return value;
}

/** The one task value tab chrome needs, without subscribing it to the task collection. */
export function useTasksSummary(): { openToday: number } {
  const value = useContext(TasksSummaryContext);
  if (!value) throw new Error('useTasksSummary must be used within a TasksProvider');
  return value;
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { viewDate, today, getDayCloseSnapshot } = useHabitsTaskBridge();
  const { celebrate: showDayComplete } = useDayComplete();

  // Seed from the last-known snapshot so the section paints on the first frame instead of shoving
  // the day down a beat later. Trusted only while the snapshot's day is still today.
  const [snapshot] = useState(readTasksSnapshot);
  const seed = snapshot && snapshot.userId === userId && snapshot.day === todayLocalISO() ? snapshot : null;

  const [rows, setRows] = useState<Task[]>(() => seed?.tasks ?? []);
  const [loading, setLoading] = useState(() => !seed);
  const [error, setError] = useState<string | null>(null);

  // Refs mirror state so async handlers and the day-close probe read the latest values.
  const rowsRef = useLatestRef(rows);
  const viewDateRef = useLatestRef(viewDate);
  const todayRef = useLatestRef(today);
  const pending = useRef<Set<string>>(new Set()); // task ids with an in-flight write
  const cancelledTempIds = useRef<Set<string>>(new Set());
  // Rows this session has deleted. A delete removes the row optimistically, its sheet pops on that
  // state, Today regains focus and refreshes — and that SELECT can reach the server before the
  // DELETE does, handing the to-do straight back. Filtering the fetch is what makes the delete
  // stick whichever round-trip wins; the id is dropped again only if the delete itself fails.
  const deletedIds = useRef<Set<string>>(new Set());

  /**
   * Fetch the rows the viewed day could need: everything ticked *that* day, plus every open task
   * there is. Open tasks are few (they leave the list the moment they're done) and the visibility
   * rule that decides which of them belong on this day is pure and tested — so the client keeps
   * one source of truth instead of the query re-stating it in PostgREST syntax.
   */
  const fetchTasks = useCallback(
    async (day: string) => {
      if (!userId) return true;
      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .or(`done_on.eq.${day},done_on.is.null`)
        .order('position', { ascending: true });
      // The view may have stepped to another day while this was in flight; the later fetch owns
      // the screen now (the same guard every completion path here uses).
      if (viewDateRef.current !== day) return true;
      if (fetchError) {
        setError(LOAD_ERROR);
        return false;
      }
      setRows((data ?? []).filter((t) => !deletedIds.current.has(t.id)));
      return true;
    },
    [userId, viewDateRef],
  );

  const refresh = useCallback(() => fetchTasks(viewDateRef.current), [fetchTasks, viewDateRef]);

  // First load, and every day-step or midnight rollover after it. Unlike the habits list this
  // doesn't blank on a day change: an open task is on both days, so clearing would flash the
  // section away and back.
  useEffect(() => {
    let active = true;
    void (async () => {
      await fetchTasks(viewDate);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchTasks, viewDate]);

  // Publish "how many tasks are open on this day" for the day-close rule in `lib/day-close.ts`.
  // Registered once and reading refs, so it always answers from current state without re-arming.
  useEffect(
    () => setOpenTasksProbe((day) => openCountOn(rowsRef.current, day, todayRef.current)),
    [rowsRef, todayRef],
  );

  // Persist the day's rows for the next cold start (trailing, so a burst of ticks writes once).
  useEffect(() => {
    if (loading || !userId || error) return;
    const timer = setTimeout(() => writeTasksSnapshot({ userId, day: viewDate, tasks: rows }), SNAPSHOT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loading, userId, error, viewDate, rows]);

  const tasks = useMemo(() => visibleTasks(rows, viewDate, today), [rows, viewDate, today]);
  const openToday = useMemo(() => openCountOn(rows, today, today), [rows, today]);
  const openTasks = useMemo(() => rows.filter(isOpen), [rows]);
  // Earliest wins: a plan that has put something on today and something on tomorrow should say the
  // one you can still act on. Done rows are skipped — a plan you finished with last week is not
  // still "on today's list".
  const scheduledPlans = useMemo(() => {
    const byPlan = new Map<string, string>();
    for (const row of rows) {
      if (row.plan_id === null || row.done_on !== null) continue;
      const held = byPlan.get(row.plan_id);
      if (held === undefined || row.due_on < held) byPlan.set(row.plan_id, row.due_on);
    }
    return byPlan;
  }, [rows]);

  const dismissError = useCallback(() => setError(null), []);

  const createTask = useCallback(
    async (title: string, options?: { day?: string; planId?: string }) => {
      if (!userId) return false;
      const clean = title.trim();
      if (!clean) return false;

      // The viewed day unless a caller names one. A plan is the only thing that names one, and the
      // only day it can name besides today is tomorrow — see `plans.scheduledLabel` for why that
      // to-do is then invisible until it arrives, which is correct rather than a gap.
      const day = options?.day ?? viewDateRef.current;
      const planId = options?.planId ?? null;
      // One to-do per plan per day while a write is in flight. A plan's row is pressed from a
      // screen that stays put, so two taps inside a frame both see the same render state — and
      // unlike a typed to-do, where a repeat is a repeat the user chose, this one would be pure
      // duplication of a title they never retyped. Read and written at call time, which is what
      // `saving` state cannot be.
      const guard = planId === null ? null : `plan:${planId}:${day}`;
      if (guard !== null) {
        if (pending.current.has(guard)) return false;
        pending.current.add(guard);
      }
      const position = rowsRef.current.reduce((max, t) => Math.max(max, t.position), -1) + 1;
      const tempId = `temp-${position}-${clean.length}-${day}`;
      const optimistic: Task = {
        id: tempId,
        user_id: userId,
        title: clean,
        due_on: day,
        done_on: null,
        plan_id: planId,
        position,
        created_at: null,
        updated_at: null,
      };
      setRows((prev) => [...prev, optimistic]);
      rowsRef.current = [...rowsRef.current, optimistic];

      try {
        const { data, error: insError } = await supabase
          .from('tasks')
          .insert({ user_id: userId, title: clean, due_on: day, position, plan_id: planId })
          .select()
          .single();
        if (insError || !data) throw insError ?? new Error('no row');
        // Deleted while the insert was in flight: honour the removal by taking the fresh server
        // row back down, rather than letting the swap resurrect it.
        if (cancelledTempIds.current.delete(tempId)) {
          void supabase.from('tasks').delete().eq('id', data.id);
          return true;
        }
        setRows((prev) => prev.map((t) => (t.id === tempId ? data : t)));
        rowsRef.current = rowsRef.current.map((t) => (t.id === tempId ? data : t));
        return true;
      } catch {
        cancelledTempIds.current.delete(tempId);
        setRows((prev) => prev.filter((t) => t.id !== tempId));
        rowsRef.current = rowsRef.current.filter((t) => t.id !== tempId);
        setError('Could not add that. Check your connection.');
        return false;
      } finally {
        if (guard !== null) pending.current.delete(guard);
      }
    },
    [userId, rowsRef, viewDateRef],
  );

  /**
   * Tick a task for the viewed day, or put it back.
   *
   * What it records is a *day*, not a flag, so a task ticked while browsing last Tuesday is
   * recorded against Tuesday. The day's close is re-read here on the same seam the stack seal
   * uses: ticking the last open thing raises the celebration, and — because an open task holds
   * the day back — sealing every stack while one is still on the list deliberately does not.
   */
  const toggleTask = useCallback(
    async (taskId: string) => {
      if (!userId) return;
      if (taskId.startsWith('temp-')) return; // its insert is still in flight
      if (pending.current.has(taskId)) return; // ignore double-taps
      const current = rowsRef.current.find((t) => t.id === taskId);
      if (!current) return;

      const day = viewDateRef.current;
      const wasDone = current.done_on !== null;
      const nextDoneOn = wasDone ? null : day;
      pending.current.add(taskId);

      const applied = rowsRef.current.map((t) => (t.id === taskId ? { ...t, done_on: nextDoneOn } : t));
      setRows(applied);
      rowsRef.current = applied;

      if (wasDone) {
        haptics.uncompleted();
      } else {
        // One crisp confirm — never the seal's rounder tail beat, which means "a group settled
        // together". A task is one thing, standing on its own, exactly like an exchange.
        const habits = getDayCloseSnapshot();
        const close = dayCloseAfter(
          habits.habits,
          habits.skipped,
          habits.completed,
          new Set<string>(),
          day,
          openCountOn(applied, day, todayRef.current),
          openCheckInsOn(day),
        );
        if (close.dayComplete) {
          haptics.celebrate(moonLitFor(day));
          if (day === todayRef.current) showDayComplete(day, close.doneIds);
        } else {
          haptics.completed();
        }
      }

      try {
        const { error: updError } = await supabase.from('tasks').update({ done_on: nextDoneOn }).eq('id', taskId);
        if (updError) throw updError;
      } catch {
        // The day may have changed mid-flight; only roll back if we're still on it.
        if (viewDateRef.current === day) {
          setRows((prev) => prev.map((t) => (t.id === taskId ? { ...t, done_on: current.done_on } : t)));
          rowsRef.current = rowsRef.current.map((t) => (t.id === taskId ? { ...t, done_on: current.done_on } : t));
        }
        setError(SAVE_ERROR);
      } finally {
        pending.current.delete(taskId);
      }
    },
    [userId, showDayComplete, getDayCloseSnapshot, rowsRef, viewDateRef, todayRef],
  );

  const renameTask = useCallback(async (taskId: string, title: string) => {
    const clean = title.trim();
    const previous = rowsRef.current.find((t) => t.id === taskId);
    if (!clean || !previous || previous.title === clean) return;
    if (taskId.startsWith('temp-')) return;

    const applied = rowsRef.current.map((t) => (t.id === taskId ? { ...t, title: clean } : t));
    setRows(applied);
    rowsRef.current = applied;

    const { error: updError } = await supabase.from('tasks').update({ title: clean }).eq('id', taskId);
    if (updError) {
      setRows((prev) => prev.map((t) => (t.id === taskId ? { ...t, title: previous.title } : t)));
      rowsRef.current = rowsRef.current.map((t) => (t.id === taskId ? { ...t, title: previous.title } : t));
      setError(SAVE_ERROR);
    }
  }, [rowsRef]);

  const deleteTask = useCallback(async (taskId: string) => {
    const removed = rowsRef.current.find((t) => t.id === taskId);
    if (!removed) return;
    deletedIds.current.add(taskId);
    setRows((prev) => prev.filter((t) => t.id !== taskId));
    rowsRef.current = rowsRef.current.filter((t) => t.id !== taskId);
    haptics.removed();

    if (taskId.startsWith('temp-')) {
      // Never persisted, but its insert may still be in flight — mark it so the success path
      // takes the server row back down instead of resurrecting it.
      cancelledTempIds.current.add(taskId);
      return;
    }

    const { error: delError } = await supabase.from('tasks').delete().eq('id', taskId);
    if (delError) {
      deletedIds.current.delete(taskId);
      setRows((prev) => [...prev, removed].sort((a, b) => a.position - b.position));
      rowsRef.current = [...rowsRef.current, removed].sort((a, b) => a.position - b.position);
      setError('Could not delete that. Check your connection.');
    }
  }, [rowsRef]);

  const value = useMemo(
    () => ({
      tasks,
      openToday,
      openTasks,
      scheduledPlans,
      loading,
      error,
      dismissError,
      createTask,
      toggleTask,
      renameTask,
      deleteTask,
      refresh,
    }),
    [
      tasks,
      openToday,
      openTasks,
      scheduledPlans,
      loading,
      error,
      dismissError,
      createTask,
      toggleTask,
      renameTask,
      deleteTask,
      refresh,
    ],
  );
  const summaryValue = useMemo(() => ({ openToday }), [openToday]);

  return (
    <TasksSummaryContext value={summaryValue}>
      <TasksContext value={value}>{children}</TasksContext>
    </TasksSummaryContext>
  );
}
