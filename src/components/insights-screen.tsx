import { Stack } from 'expo-router';

import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { HabitStatsHero } from '@/components/habit-stats-hero';
import { HabitStreakCard } from '@/components/habit-streak-card';
import { HabitTrendChart } from '@/components/habit-trend-chart';
import { HabitWeekdayBars } from '@/components/habit-weekday-bars';
import type { HabitStats } from '@/lib/habit-stats';

import type { ScrollViewProps } from 'react-native';

/**
 * "Insights" — the four cards, for whichever unit is being read: one act or exchange
 * (`habits/stats`) or a whole stack (`habits/stack-stats`).
 *
 * The two screens differ only in where their numbers come from, so the screen itself is written
 * once. That is not just tidiness: the cards are the app's claim about how you're doing, and two
 * copies of this file would be two places for a card to be added, reordered, or quietly styled
 * differently — the drift that made a stack and an exchange feel like different products in the
 * first place.
 *
 * A pushed transparent screen, so the fixed sky shows behind the cards, exactly like Progress.
 */
export function InsightsScreen({
  title,
  stats,
  hijriNote,
  emptyBody,
  error,
  onDismissError,
  refreshControl,
}: {
  /** The unit's own name — the pushed-detail voice, not a tab's large title. */
  title: string;
  stats: HabitStats;
  /** Shown in place of the weekday bars when a weekday split can't mean anything (Hijri schedules). */
  hijriNote?: string;
  /** What to say before there is any history — the one line that differs between the units. */
  emptyBody: string;
  error: string | null;
  onDismissError: () => void;
  refreshControl: ScrollViewProps['refreshControl'];
}) {
  return (
    <>
      <Stack.Screen options={{ title }} />

      {stats.scheduledDays === 0 ? (
        <AppScreen transparent centered refreshControl={refreshControl}>
          <EmptyState icon="insights" title="No rhythm yet" body={emptyBody} />
        </AppScreen>
      ) : (
        <AppScreen transparent refreshControl={refreshControl}>
          <ErrorBanner message={error} onDismiss={onDismissError} />

          <HabitStatsHero consistency={stats.consistency} trend={stats.trend} scheduledDays={stats.scheduledDays} />

          <HabitWeekdayBars
            byWeekday={stats.byWeekday}
            bestWeekday={stats.bestWeekday}
            toughestWeekday={stats.toughestWeekday}
            hijriNote={hijriNote}
          />

          <HabitStreakCard currentStreak={stats.currentStreak} longestStreak={stats.longestStreak} />

          <HabitTrendChart trend={stats.trend} />
        </AppScreen>
      )}
    </>
  );
}
