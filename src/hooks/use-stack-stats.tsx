import { useCallback, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useHabits, type Habit, type HabitStack } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { addDaysISO, todayLocalISO } from '@/lib/dates';
import { STATS_WINDOW_DAYS, type HabitStats } from '@/lib/habit-stats';
import type { CompletionRow } from '@/lib/progress';
import { computeStackStats } from '@/lib/stack-stats';
import { supabase } from '@/lib/supabase';

/** Pull a stack's acts' completion history over the stats window. Only rows that exist are
 *  returned, so the payload scales with real usage, not the window. Throws on a query error. */
async function fetchStackCompletions(userId: string, habitIds: string[], today: string): Promise<CompletionRow[]> {
  if (habitIds.length === 0) return [];
  const since = addDaysISO(today, -(STATS_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from('habit_completions')
    .select('habit_id, completed_at, status, count')
    .eq('user_id', userId)
    .in('habit_id', habitIds)
    .gte('completed_at', since);
  if (error) throw error;
  return data ?? [];
}

type StackStatsData = {
  /** True only during the first load. */
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  /** Re-pull this stack's window (pull-to-refresh). Silent — owns no spinner of its own. */
  refresh: () => Promise<void>;
  /** The stack definition (from the in-memory Habits list), or `null` if it's gone. */
  stack: HabitStack | null;
  /** Its acts, in sequence order. */
  members: Habit[];
  /** The derived stats, or `null` until the stack resolves. */
  stats: HabitStats | null;
};

/**
 * Read-only per-stack stats for the stack's Insights screen — the sibling of {@link useHabitStats},
 * and the same shape, because the screen behind both is the same four cards.
 *
 * The stack and its acts come from `useHabits()` (already in memory — the screen is a descendant of
 * `HabitsProvider`); only the acts' completion history is fetched. Refetches whenever the screen
 * regains focus, so a seal made on Today shows up on return.
 *
 * The identity includes the **member ids**, not just the stack id: acts join and leave a stack, and
 * a window fetched for yesterday's membership would quietly measure the wrong sequence.
 */
export function useStackStats(stackId: string): StackStatsData {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { habits, stacks } = useHabits();

  const stack = useMemo(() => stacks.find((s) => s.id === stackId) ?? null, [stacks, stackId]);
  const members = useMemo(
    () => habits.filter((h) => h.stack_id === stackId).sort((a, b) => a.position - b.position),
    [habits, stackId],
  );
  // Sorted so a pure reorder — which changes nothing this screen measures — doesn't refetch.
  const memberKey = useMemo(() => members.map((m) => m.id).sort().join(','), [members]);

  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [today, setToday] = useState<string>(() => todayLocalISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The identity this hook instance currently serves — a fetch that lands after the identity moved
  // on (user switch, stack param change, an act added or removed) must neither be reused nor write.
  const identity = `${userId}:${stackId}:${memberKey}`;
  const identityRef = useLatestRef(identity);
  const todayRef = useLatestRef(today);

  // Concurrent callers (mount preload, a focus refetch, pull-to-refresh) share one request — the
  // one already in flight is milliseconds old and just as fresh. Keyed by identity so a request for
  // a *previous* stack/user/membership is never handed to the new one.
  const inFlight = useRef<{ key: string; work: Promise<void> } | null>(null);
  const fetchData = useCallback(async () => {
    if (!userId) return;
    const key = identity;
    if (inFlight.current?.key === key) return inFlight.current.work;
    const day = todayLocalISO();
    // The ids ARE the identity's third field — read them from it rather than from `members`, whose
    // array identity churns on every habits update and would re-arm the fetch effect each time.
    const ids = memberKey ? memberKey.split(',') : [];
    const work = (async () => {
      try {
        const rows = await fetchStackCompletions(userId, ids, day);
        if (identityRef.current !== key) return; // superseded mid-flight — discard
        setToday(day);
        setCompletions(rows);
        setError(null);
      } catch {
        if (identityRef.current !== key) return;
        setError("Couldn't load these insights. Pull down to try again.");
      } finally {
        if (inFlight.current?.key === key) inFlight.current = null;
      }
    })();
    inFlight.current = { key, work };
    return work;
  }, [userId, identity, memberKey, identityRef]);

  useRefreshLifecycle(userId, fetchData, todayRef, setLoading);

  const dismissError = useCallback(() => setError(null), []);

  const stats = useMemo(
    () => (stack ? computeStackStats(members, completions, today) : null),
    [stack, members, completions, today],
  );

  return { loading, error, dismissError, refresh: fetchData, stack, members, stats };
}
