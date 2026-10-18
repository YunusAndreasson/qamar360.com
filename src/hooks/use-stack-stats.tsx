import { useCallback, useMemo } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useHabits, type Habit, type HabitStack } from '@/hooks/use-habits';
import { useHistoryRead } from '@/hooks/use-history-read';
import { fetchCompletionRows } from '@/lib/completion-reads';
import { addDaysISO } from '@/lib/dates';
import { STATS_WINDOW_DAYS, type HabitStats } from '@/lib/habit-stats';
import type { CompletionRow } from '@/lib/progress';
import { computeStackStats } from '@/lib/stack-stats';

/** Pull a stack's acts' completion history over the stats window. Only rows that exist are
 *  returned, so the payload scales with real usage, not the window. Throws on a query error. */
async function fetchStackCompletions(userId: string, habitIds: string[], today: string): Promise<CompletionRow[]> {
  if (habitIds.length === 0) return [];
  const since = addDaysISO(today, -(STATS_WINDOW_DAYS - 1));
  return fetchCompletionRows(userId, (query) => query.in('habit_id', habitIds).gte('completed_at', since));
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
 * Read-only per-stack stats for the stack's Stats screen — the sibling of {@link useHabitStats},
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

  const load = useCallback(
    (userId: string, today: string) => fetchStackCompletions(userId, memberKey ? memberKey.split(',') : [], today),
    [memberKey],
  );
  const { data: completions, today, ...read } = useHistoryRead<CompletionRow[]>(
    userId,
    `${userId}:${stackId}:${memberKey}`,
    load,
    [],
    'Could not load these stats. Pull down to try again.',
  );

  const stats = useMemo(
    () => (stack ? computeStackStats(members, completions, today) : null),
    [stack, members, completions, today],
  );

  return { ...read, stack, members, stats };
}
