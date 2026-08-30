import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useLatestRef } from '@/hooks/use-latest-ref';
import type { Plan } from '@/lib/plans';
import { supabase } from '@/lib/supabase';

/**
 * The plans — what you mean to do, before any of it has a day.
 *
 * Modelled on {@link import('./use-tasks').TasksProvider}, and deliberately smaller than it. A task
 * belongs to a day, so its provider carries a viewed-day guard on every write, a rule for which
 * rows show, a probe telling the day whether it may close, and a snapshot so the section paints on
 * the first frame. A plan is on no day, so none of that applies: there is no `viewDate` to race, no
 * visibility rule, nothing to hold the day back, and nothing on the critical first frame to protect.
 *
 * What it does keep is the one guard that is about the network rather than the day: a row this
 * session deleted is filtered out of any fetch still in flight, so a refresh that overtakes the
 * DELETE cannot hand the plan back.
 *
 * Writes here **await** rather than painting optimistically. Every one of them is made from a form
 * with a Save, or from a row that then navigates — and in both cases the screen has somewhere to
 * stay if the write fails, which is worth more than a frame of speed. It also closes the race the
 * task list needs `deletedIds` for in the other direction: a caller that navigates on success knows
 * the row is really there before the screen it returns to refetches.
 */

const LOAD_ERROR = 'Could not load your plans. Check your connection and try again.';
const SAVE_ERROR = 'Could not save that. Check your connection.';

type PlansContextValue = {
  /** Every plan, in the order they were written down. */
  plans: Plan[];
  /** True only until the first load settles. */
  loading: boolean;
  /** Plain-language message for the last failure, or null. */
  error: string | null;
  dismissError: () => void;
  /** Write a new plan. Answers with the stored row, so the editor can go on to schedule from it. */
  createPlan: (title: string, body: string) => Promise<Plan | null>;
  /** Rewrite a plan's title or notes. Answers whether it was stored. */
  updatePlan: (planId: string, patch: { title: string; body: string }) => Promise<boolean>;
  deletePlan: (planId: string) => Promise<boolean>;
  /** Re-pull the list — plans are edited on the web too, so a screen refetches when it opens. */
  refresh: () => Promise<boolean>;
};

const PlansContext = createContext<PlansContextValue | null>(null);

export function usePlans(): PlansContextValue {
  const value = useContext(PlansContext);
  if (!value) throw new Error('usePlans must be used within a PlansProvider');
  return value;
}

export function PlansProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rowsRef = useLatestRef(rows);
  // Rows this session has deleted. A delete removes the plan, its screen pops on that state, the
  // list regains focus and refetches — and that SELECT can reach the server before the DELETE does.
  // The id is dropped again only if the delete itself failed.
  const deletedIds = useRef<Set<string>>(new Set());

  const fetchPlans = useCallback(async () => {
    if (!userId) return true;
    const { data, error: fetchError } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });
    if (fetchError) {
      setError(LOAD_ERROR);
      return false;
    }
    setRows((data ?? []).filter((plan) => !deletedIds.current.has(plan.id)));
    setError(null);
    return true;
  }, [userId]);

  // First load, and again whenever the account changes. The `void (async …)()` shape rather than a
  // bare `setState` in the effect body, which the React Compiler's lint rejects.
  useEffect(() => {
    let active = true;
    void (async () => {
      await fetchPlans();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchPlans]);

  const dismissError = useCallback(() => setError(null), []);

  const createPlan = useCallback(
    async (title: string, body: string): Promise<Plan | null> => {
      if (!userId) return null;
      const clean = title.trim();
      if (!clean) return null;
      // The same running counter the day's to-dos use, so a plan written now lands at the foot of
      // the list rather than jumping to the top of one you have already put in an order.
      const position = rowsRef.current.reduce((max, plan) => Math.max(max, plan.position), -1) + 1;

      const { data, error: insError } = await supabase
        .from('plans')
        .insert({ user_id: userId, title: clean, body: body.trim(), position })
        .select()
        .single();
      if (insError || !data) {
        setError('Could not add that. Check your connection.');
        return null;
      }
      setRows((prev) => [...prev, data]);
      rowsRef.current = [...rowsRef.current, data];
      return data;
    },
    [userId, rowsRef],
  );

  const updatePlan = useCallback(
    async (planId: string, patch: { title: string; body: string }): Promise<boolean> => {
      const clean = patch.title.trim();
      // The column refuses an empty title, so this is the client saying the same thing in time to
      // keep the editor open on the text rather than bouncing a constraint violation back at it.
      if (!clean) return false;

      const { data, error: updError } = await supabase
        .from('plans')
        .update({ title: clean, body: patch.body.trim() })
        .eq('id', planId)
        .select()
        .single();
      if (updError || !data) {
        setError(SAVE_ERROR);
        return false;
      }
      setRows((prev) => prev.map((plan) => (plan.id === planId ? data : plan)));
      rowsRef.current = rowsRef.current.map((plan) => (plan.id === planId ? data : plan));
      return true;
    },
    [rowsRef],
  );

  const deletePlan = useCallback(
    async (planId: string): Promise<boolean> => {
      deletedIds.current.add(planId);
      const { error: delError } = await supabase.from('plans').delete().eq('id', planId);
      if (delError) {
        deletedIds.current.delete(planId);
        setError('Could not delete that. Check your connection.');
        return false;
      }
      setRows((prev) => prev.filter((plan) => plan.id !== planId));
      rowsRef.current = rowsRef.current.filter((plan) => plan.id !== planId);
      return true;
    },
    [rowsRef],
  );

  const value = useMemo(
    () => ({ plans: rows, loading, error, dismissError, createPlan, updatePlan, deletePlan, refresh: fetchPlans }),
    [rows, loading, error, dismissError, createPlan, updatePlan, deletePlan, fetchPlans],
  );

  return <PlansContext value={value}>{children}</PlansContext>;
}
