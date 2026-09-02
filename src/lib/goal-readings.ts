/**
 * Reading the goals from outside the navigator — the lunar-update arming, which runs as the app
 * goes to the background and has no provider above it.
 *
 * Apart from `use-goals` for the same reason {@link import('./load-progress').loadProgress} is
 * apart from its hook: the arming path is reached from `use-habits`, and `use-goals` now depends
 * on `use-habits` for the day a check-in closes — so a loader living in the hook file put the two
 * in a require cycle. The sibling of `loadProgress`, and now its neighbour.
 */

import type { Habit } from '@/hooks/use-habits';
import { computeGoals, type Goal, type GoalReading } from '@/lib/goals';
import { supabase } from '@/lib/supabase';

/** The generated row type carries the cadence's Hijri schedule as `Json`; `Goal` narrows it. */
const asGoals = (rows: { check_in_hijri: unknown }[]): Goal[] => rows as unknown as Goal[];

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
  const [goalsRes, actsRes, checkInsRes] = await Promise.all([
    supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'open'),
    supabase.from('goal_acts').select('*').eq('user_id', userId),
    supabase.from('goal_check_ins').select('*').eq('user_id', userId),
  ]);
  const goals = asGoals(goalsRes.data ?? []);
  const acts = (actsRes.data ?? []).filter((act) => goals.some((goal) => goal.id === act.goal_id));
  const checkIns = (checkInsRes.data ?? []).filter((row) => goals.some((goal) => goal.id === row.goal_id));
  if (goals.length === 0) return [];
  // A goal driven by neither acts nor readings has no figure to put on a lock screen. Both are
  // checked, where once only the engine was: a reported goal has no engine at all.
  if (acts.length === 0 && checkIns.length === 0) return [];

  const habitIds = [...new Set(acts.map((act) => act.habit_id))];
  const [habitsRes, completionsRes] = await Promise.all([
    supabase.from('habits').select('*').in('id', habitIds),
    supabase.from('habit_completions').select('habit_id, completed_at, status, count').in('habit_id', habitIds),
  ]);
  if (habitsRes.error || completionsRes.error) return [];
  // The same narrowing `use-progress` applies on its own fetch: the generated row type carries
  // `hijri_schedule` as `Json`, and every consumer in the app reads it as a `HijriSchedule`.
  return computeGoals(goals, acts, (habitsRes.data ?? []) as Habit[], completionsRes.data ?? [], checkIns, today);
}
