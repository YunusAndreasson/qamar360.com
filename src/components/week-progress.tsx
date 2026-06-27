import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ProgressCell } from '@/components/progress-cell';
import { StatCard } from '@/components/stat-card';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import type { Habit } from '@/hooks/use-habits';
import { addDaysISO, scheduledOn, weekdayIndex } from '@/lib/dates';
import { toDegrees } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

const WEEK_DAYS = 7;

const DAY_ABBREVS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function dayAbbrev(iso: string): string {
  return DAY_ABBREVS[new Date(iso + 'T12:00:00').getDay()];
}

type Props = ViewProps & {
  habits: Habit[];
  completed: Set<string>;
  /** Ids skipped (excused) for `viewDate` — excluded from that day's rate, like a rest day. */
  skipped: Set<string>;
  today: string;
  viewDate: string;
};

type DayStats = {
  completed: number;
  possible: number;
  fraction: number;
  isComplete: boolean;
  isRest: boolean;
};

type CompletionByDate = Map<string, Set<string>>;

/** The seven days of the Sunday→Saturday calendar week that contains `iso`. */
function weekDays(iso: string): string[] {
  const start = addDaysISO(iso, -weekdayIndex(iso)); // back up to Sunday
  return Array.from({ length: WEEK_DAYS }, (_, i) => addDaysISO(start, i));
}

/** Partition rows into per-date sets of done ids and skipped (excused) ids. */
function buildStatusMaps(rows: { habit_id: string; completed_at: string; status: string }[]): {
  done: CompletionByDate;
  skipped: CompletionByDate;
} {
  const done: CompletionByDate = new Map();
  const skipped: CompletionByDate = new Map();
  for (const row of rows) {
    const byDate = row.status === 'skipped' ? skipped : done;
    let set = byDate.get(row.completed_at);
    if (!set) {
      set = new Set();
      byDate.set(row.completed_at, set);
    }
    set.add(row.habit_id);
  }
  return { done, skipped };
}

function dayStats(
  habits: Habit[],
  doneSet: Set<string> | undefined,
  skippedSet: Set<string> | undefined,
  iso: string,
): DayStats {
  let completed = 0;
  let possible = 0;
  for (const h of habits) {
    if (!scheduledOn(h, iso)) continue;
    if (skippedSet?.has(h.id)) continue; // excused — out of the rate entirely (numerator and denominator)
    possible += 1;
    if (doneSet?.has(h.id)) completed += 1;
  }
  const fraction = possible ? completed / possible : 0;
  return {
    completed,
    possible,
    fraction,
    isComplete: possible > 0 && completed === possible,
    isRest: possible === 0,
  };
}

/**
 * The current calendar week (Sunday→Saturday) as a row of completion circles, styled to match
 * the year moons in the Month tab. The week shown is the one containing the viewed day, so it
 * follows the day-stepper; days still in the future render as faint "new moons". The viewed
 * day's circle updates live as habits are ticked; the rest are fetched once.
 */
export function WeekProgress({ habits, completed, skipped, today, viewDate, style, ...rest }: Props) {
  const { user } = useAuth();
  const days = useMemo(() => weekDays(viewDate), [viewDate]);
  const [pastDone, setPastDone] = useState<CompletionByDate>(new Map());
  const [pastSkipped, setPastSkipped] = useState<CompletionByDate>(new Map());

  useEffect(() => {
    if (!user?.id || habits.length === 0) return;
    // Fetch the elapsed part of the shown week (cap at today — future days have no data).
    const end = days[WEEK_DAYS - 1] < today ? days[WEEK_DAYS - 1] : today;
    void supabase
      .from('habit_completions')
      .select('habit_id, completed_at, status')
      .eq('user_id', user.id)
      .gte('completed_at', days[0])
      .lte('completed_at', end)
      .then(({ data }) => {
        if (!data) return;
        const maps = buildStatusMaps(data);
        setPastDone(maps.done);
        setPastSkipped(maps.skipped);
      });
  }, [user?.id, today, habits.length, days]);

  // Live sets for the viewed day override the fetched copies (they update as the user
  // ticks/skips on the Today list); the rest of the week comes from the one-time fetch.
  const doneByDate = useMemo(() => {
    const map = new Map(pastDone);
    map.set(viewDate, completed);
    return map;
  }, [pastDone, completed, viewDate]);

  const skippedByDate = useMemo(() => {
    const map = new Map(pastSkipped);
    map.set(viewDate, skipped);
    return map;
  }, [pastSkipped, skipped, viewDate]);

  const weekStats = useMemo(
    () =>
      days.map((iso) => {
        const isFuture = iso > today;
        const stats = dayStats(habits, doneByDate.get(iso), skippedByDate.get(iso), iso);
        return { iso, isFuture, ...stats, fraction: isFuture ? 0 : stats.fraction };
      }),
    [days, habits, doneByDate, skippedByDate, today],
  );

  if (habits.length === 0) return null;

  const a11y = `This week: ${weekStats
    .filter((d) => !d.isFuture)
    .map((d) => `${dayAbbrev(d.iso)} ${toDegrees(d.fraction)} degrees`)
    .join(', ')}.`;

  return (
    <StatCard style={[styles.card, style]} {...rest} accessible accessibilityLabel={a11y}>
      <View style={styles.grid}>
        {weekStats.map((day) => (
          // The viewed day is emphasized so the day-stepper and this strip read as one
          // unit — and it's the live ring (it updates as habits are ticked).
          <ProgressCell
            key={day.iso}
            label={dayAbbrev(day.iso)}
            fraction={day.fraction}
            active={day.iso === viewDate}
            muted={day.isFuture}
            style={styles.cell}
          />
        ))}
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  grid: { flexDirection: 'row' },
  cell: { flex: 1 },
});
