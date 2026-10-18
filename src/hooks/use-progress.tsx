import { useMemo } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useHistoryRead } from '@/hooks/use-history-read';
import { fetchProgressWindow } from '@/lib/load-progress';
import { computeProgress, type MonthProgress, type RecordSeries, type SeriesPeriod } from '@/lib/progress';

// The progress math lives in `@/lib/progress` (pure, no React/Supabase — unit-testable).
// Re-export its public types so existing screen components keep importing them from this hook.
export type { MonthProgress, RecordSeries, SeriesPoint } from '@/lib/progress';

type ProgressData = {
  /** True only during the first load. */
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  /** Re-pull the window (pull-to-refresh). Silent — owns no spinner of its own. */
  refresh: () => Promise<void>;
  habitsCount: number;
  /** This Hijri month's completion so far — the moon ring, or `null` if unavailable. */
  month: MonthProgress | null;
  /** The record read over each period: the year's twelve months, and the lifetime's line. `life`
   *  is the whole of it, and the only reading that moves on a second day of use. */
  seriesByPeriod: Record<SeriesPeriod, RecordSeries>;
  /** The periods with a card to show, narrowest first. Without a calendar, `life` alone. */
  seriesPeriods: SeriesPeriod[];
  /** The local day these figures describe. Owned here because it survives a midnight rollover,
   *  which a `todayLocalISO()` call in a screen's render would not. */
  today: string;
};

/**
 * Read-only view of the user's whole habit history. Independent of `HabitsProvider` (which lives
 * only on the Habits tab and loads today alone): this pulls every completion on record — "This
 * life" is measured in Hijri years, so a window would cut the record off — and refetches whenever
 * the Progress tab regains focus, so ticks made elsewhere show up on return.
 */
export function useProgress(): ProgressData {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data, today, ...read } = useHistoryRead(
    userId,
    `${userId}`,
    fetchProgressWindow,
    { habits: [], completions: [] },
    'Could not load your progress. Pull down to try again.',
  );
  const { habits, completions } = data;

  const derived = useMemo(() => computeProgress(habits, completions, today), [habits, completions, today]);

  return { ...read, today, ...derived };
}
