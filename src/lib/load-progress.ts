/**
 * Reading the record: one fetch, and the two pure sweeps run over it.
 *
 * This is the data layer under {@link import('@/hooks/use-progress').useProgress}, and it lives
 * apart from that hook because two callers need it from **outside** the navigator — the
 * day-complete overlay and the lunar-update arming — and importing a hook module to reach them
 * put `use-goals` (which both of those paths lead back to) into a require cycle. A provider-free
 * loader was never a hook's to own; it is here now, where `lib/notifications` and
 * `lib/preferences` already sit.
 */

import type { Habit } from '@/hooks/use-habits';
import { addDaysISO } from '@/lib/dates';
import { computeReadings, type Reading } from '@/lib/insights';
import {
  computeProgress,
  creditOnDay,
  withDoneToday,
  type CompletionRow,
  type ProgressDerived,
} from '@/lib/progress';
import { supabase } from '@/lib/supabase';

/**
 * The two pure sweeps, run over one fetch: the instruments and the quarterly readings.
 *
 * They are composed here rather than inside `computeProgress` so `lib/insights` can depend on
 * `lib/progress` (for the app's degrees unit and its habit shape) without the two importing each
 * other. Both read the SAME completion rule — {@link creditOnDay} — so a reading can never quote
 * a figure the orbit above it disagrees with.
 */
export function derive(habits: Habit[], completions: CompletionRow[], today: string): Derived {
  return {
    ...computeProgress(habits, completions, today),
    readings: computeReadings(habits, creditOnDay(completions), today),
  };
}

/** Everything one progress fetch yields. */
export type Derived = ProgressDerived & {
  /**
   * One written reading per moon quarter, newest first — the Insights feed, and the text the
   * lunar updates carry. Includes the quarter still being lived (`closed: false`), which only
   * the notification arming reads.
   */
  readings: Reading[];
};

/**
 * How far back the day-complete overlay pulls completions — a Hijri year covers everything its
 * card reads (this month, last month, the year's months). The query returns only rows that exist,
 * so the payload scales with real usage, not the window.
 *
 * The Progress *tab* passes no window at all: "This life" is every Hijri year on record, and a
 * year-long window would silently cut the record off at its edge. All-time is a bounded amount of
 * data — one row per habit per day actually kept — and the tab fetches it once per focus.
 */
const OVERLAY_WINDOW_DAYS = 370;

/** Pull habits + completions for a user, optionally limited to the last `windowDays`. Shared by
 *  the focus-driven hook (all time) and the one-shot {@link loadProgress} (windowed — the
 *  day-complete celebration fetches outside the navigator, where `useFocusEffect` can't run).
 *  Throws on a query error. */
export async function fetchProgressWindow(
  userId: string,
  today: string,
  windowDays?: number,
): Promise<{ habits: Habit[]; completions: CompletionRow[] }> {
  const completionsQuery = supabase
    .from('habit_completions')
    .select('habit_id, completed_at, status, count')
    .eq('user_id', userId);
  const [habitsRes, completionsRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', userId).order('position', { ascending: true }),
    windowDays === undefined
      ? completionsQuery
      : completionsQuery.gte('completed_at', addDaysISO(today, -(windowDays - 1))),
  ]);
  if (habitsRes.error) throw habitsRes.error;
  if (completionsRes.error) throw completionsRes.error;
  return { habits: (habitsRes.data ?? []) as Habit[], completions: completionsRes.data ?? [] };
}

/** One-shot progress read (fetch + pure {@link computeProgress}) for callers outside the Progress
 *  tab — the day-complete overlay. Same window and math as {@link useProgress}. `doneToday` are the
 *  ids the overlay already knows are done for `today` (it only fires once the day is complete) —
 *  overlaid via {@link withDoneToday} so the overlay's degrees don't undercount ticks that haven't
 *  yet reached the server, and so match the Progress tab. */
export async function loadProgress(userId: string, today: string, doneToday: string[]): Promise<Derived> {
  const { habits, completions } = await fetchProgressWindow(userId, today, OVERLAY_WINDOW_DAYS);
  return derive(habits, withDoneToday(completions, doneToday, today), today);
}
