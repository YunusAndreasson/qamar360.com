import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useDayComplete } from '@/components/day-complete';
import { useAuth } from '@/hooks/use-auth';
import { useGuardedMutation } from '@/hooks/use-guarded-mutation';
import { useHabitsTaskBridge } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { todayLocalISO } from '@/lib/dates';
import { dayCloseAfter, moonLitFor, setOpenTasksProbe } from '@/lib/day-close';
import { haptics } from '@/lib/haptics';
import { newId } from '@/lib/id';
import { createRefreshGuard } from '@/lib/refresh-guard';
import { supabase } from '@/lib/supabase';
import { openCountOn, visibleTasks, type Task } from '@/lib/tasks';
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
  /** True only until the first load settles (false immediately when a snapshot seeded it). */
  loading: boolean;
  /** Plain-language message for the last failure, or null. */
  error: string | null;
  dismissError: () => void;
  /**
   * Write a new task on the viewed day. Blank titles are ignored; the answer says whether it was
   * persisted, so a caller that navigates away can wait for the row rather than racing its own
   * refetch.
   */
  createTask: (title: string) => Promise<boolean>;
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
  const userRef = useLatestRef(userId);
  const [refreshGuard] = useState(createRefreshGuard);
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
      try {
        return (await refreshGuard.read(
          () => supabase
            .from('tasks')
            .select('*')
            .eq('user_id', userId)
            .or(`done_on.eq.${day},done_on.is.null`)
            .order('position', { ascending: true }),
          ({ data, error: fetchError }) => {
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
          () => viewDateRef.current === day && userRef.current === userId,
        )) ?? true;
      } catch {
        if (viewDateRef.current !== day || userRef.current !== userId) return true;
        setError(LOAD_ERROR);
        return false;
      }
    },
    [userId, viewDateRef, userRef, refreshGuard],
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

  const dismissError = useCallback(() => setError(null), []);

  const runCreateTask = useCallback(
    async (title: string) => {
      if (!userId) return false;
      const clean = title.trim();
      if (!clean) return false;

      const day = viewDateRef.current;
      const position = rowsRef.current.reduce((max, t) => Math.max(max, t.position), -1) + 1;
      // Unique per create, not derived from the row: a position/length/day id repeated whenever a
      // to-do was deleted and another of the same length added before the first insert answered,
      // and the two in-flight rows then shared one cancellation mark (the kept one deleted on the
      // server, the deleted one resurrected). The `temp-` prefix is what the rest of this file reads.
      const tempId = `temp-${newId()}`;
      const optimistic: Task = {
        id: tempId,
        user_id: userId,
        title: clean,
        due_on: day,
        done_on: null,
        position,
        created_at: null,
        updated_at: null,
      };
      setRows((prev) => [...prev, optimistic]);
      rowsRef.current = [...rowsRef.current, optimistic];

      try {
        const { data, error: insError } = await supabase
          .from('tasks')
          .insert({ user_id: userId, title: clean, due_on: day, position })
          .select()
          .single();
        if (insError || !data) throw insError ?? new Error('no row');
        // Deleted while the insert was in flight: honour the removal by taking the fresh server
        // row back down, rather than letting the swap resurrect it.
        if (cancelledTempIds.current.delete(tempId)) {
          const { error: deleteError } = await supabase.from('tasks').delete().eq('id', data.id);
          if (deleteError) throw deleteError;
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
  const runToggleTask = useCallback(
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

  const runRenameTask = useCallback(async (taskId: string, title: string) => {
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

  const runDeleteTask = useCallback(async (taskId: string) => {
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

  const createTask = useGuardedMutation(refreshGuard.begin, refreshGuard.end, runCreateTask);
  const toggleTask = useGuardedMutation(refreshGuard.begin, refreshGuard.end, runToggleTask);
  const renameTask = useGuardedMutation(refreshGuard.begin, refreshGuard.end, runRenameTask);
  const deleteTask = useGuardedMutation(refreshGuard.begin, refreshGuard.end, runDeleteTask);

  const value = useMemo(
    () => ({
      tasks,
      openToday,
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
