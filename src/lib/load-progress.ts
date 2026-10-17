/**
 * Reading the record: one fetch, and the pure sweep run over it.
 *
 * This is the data layer under {@link import('@/hooks/use-progress').useProgress}, and it lives
 * apart from that hook because two callers need it from **outside** the navigator — the
 * day-complete overlay and the lunar-update arming. A provider-free loader was never a hook's to
 * own; it is here, where `lib/notifications` and `lib/preferences` already sit.
 */

import type { Habit } from '@/hooks/use-habits';
import { fetchCompletionRows } from '@/lib/completion-reads';
import { addDaysISO } from '@/lib/dates';
import { computeProgress, withDoneToday, type CompletionRow, type ProgressDerived } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

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
  const [habitsRes, completions] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', userId).order('position', { ascending: true }),
    fetchCompletionRows(userId, (query) =>
      windowDays === undefined ? query : query.gte('completed_at', addDaysISO(today, -(windowDays - 1))),
    ),
  ]);
  if (habitsRes.error) throw habitsRes.error;
  return { habits: (habitsRes.data ?? []) as Habit[], completions };
}

/** One-shot progress read (fetch + pure {@link computeProgress}) for callers outside the Progress
 *  tab — the day-complete overlay. Same window and math as {@link useProgress}. `doneToday` are the
 *  ids the overlay already knows are done for `today` (it only fires once the day is complete) —
 *  overlaid via {@link withDoneToday} so the overlay's degrees don't undercount ticks that haven't
 *  yet reached the server, and so match the Progress tab. */
export async function loadProgress(userId: string, today: string, doneToday: string[]): Promise<ProgressDerived> {
  const { habits, completions } = await fetchProgressWindow(userId, today, OVERLAY_WINDOW_DAYS);
  return computeProgress(habits, withDoneToday(completions, doneToday, today), today);
}
