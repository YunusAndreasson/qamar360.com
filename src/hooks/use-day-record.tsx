import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useHabits } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { weekStartISO } from '@/lib/dates';
import { rateOf, replaceDay, rowsForDay } from '@/lib/day-record';
import { tallyDays, type CompletionRow } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

type DayRecord = {
  /**
   * A day's completion, 0–1; `null` when the day asked for nothing; `undefined` when the record
   * has no word on it here (a day still ahead, one before the window, or before the first read).
   */
  rateOn: (iso: string) => number | null | undefined;
  /** Re-read the window: Today's focus and pull-to-refresh, beside the day's own refresh. */
  refresh: () => Promise<void>;
};

const DayRecordContext = createContext<DayRecord | null>(null);

/**
 * Every day you can reach from Today, with how much of each was kept: the week bar's orbits and the
 * calendar's.
 *
 * The window is the days the day picker reaches, widened back to the Saturday that opens their
 * first week, so the earliest week in the bar is whole. One read of it, then kept current from the
 * day itself: whatever the viewed day's list shows (a tick still on its way to the server
 * included) is written into the record as it changes, so the orbit above a day moves with the
 * day's own ring, and is still right after you leave it. Nothing else writes completions for a past
 * day, and a change from outside (resetting progress in Settings) comes back with Today's focus
 * refresh.
 *
 * Its own provider rather than more of `HabitsProvider`: that one owns the day and its writes, this
 * only reads them, and the two are wired by nothing but the viewed day's sets.
 */
export function DayRecordProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { habits, completed, skipped, counts, completionsLoading, viewDate, today, minViewDate } = useHabits();
  const from = weekStartISO(minViewDate);
  const [rows, setRows] = useState<CompletionRow[] | null>(null);

  // The viewed day as rows, but only once its sets are its own: right after a day-switch they are
  // blanked until the day's fetch lands, and writing that blank into the record would empty the
  // day's orbit for a moment on every switch.
  const live = useLatestRef({ viewDate, completed, skipped, counts, settled: !completionsLoading });

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('habit_completions')
      .select('habit_id, completed_at, status, count')
      .eq('user_id', userId)
      .gte('completed_at', from)
      .lte('completed_at', today);
    if (error) return; // keep what is drawn; the next focus tries again
    // A tick made while this was in flight is in the day's sets but maybe not in `data`.
    const day = live.current;
    setRows(day.settled ? replaceDay(data ?? [], day.viewDate, rowsForDay(day.viewDate, day.completed, day.skipped, day.counts)) : (data ?? []));
  }, [userId, from, today, live]);

  // The first read, and again whenever the window moves (a new day, another account). The
  // `void (async …)()` shape, as the other providers use, for the compiler lint.
  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  // Each settled change to the viewed day goes into the record as it renders, so the orbit above
  // the day moves in the same frame as the day's own rings, and leaving the day keeps it. Adjusted
  // during render rather than in an effect (React's pattern for state that follows other state):
  // an effect would paint the bar one frame behind the list on every tick.
  const [written, setWritten] = useState({ viewDate, completed, skipped, counts });
  const unwritten =
    written.viewDate !== viewDate || written.completed !== completed || written.skipped !== skipped || written.counts !== counts;
  if (!completionsLoading && unwritten) {
    setWritten({ viewDate, completed, skipped, counts });
    if (rows) setRows(replaceDay(rows, viewDate, rowsForDay(viewDate, completed, skipped, counts)));
  }

  const tallies = rows ? tallyDays(habits, rows, from, today) : null;
  const rateOn = (iso: string) => (tallies?.has(iso) ? rateOf(tallies.get(iso)) : undefined);

  return <DayRecordContext value={{ rateOn, refresh }}>{children}</DayRecordContext>;
}

export function useDayRecord(): DayRecord {
  const value = useContext(DayRecordContext);
  if (!value) throw new Error('useDayRecord must be used within a DayRecordProvider');
  return value;
}
