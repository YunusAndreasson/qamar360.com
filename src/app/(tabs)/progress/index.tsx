import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { GoalTrendChart } from '@/components/goal-trend-chart';
import { MonthSummary } from '@/components/month-summary';
import { OverTime } from '@/components/over-time';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import type { GoalCheckIn } from '@/lib/check-ins';
import { goalMeta, goalSeries, type GoalReading } from '@/lib/goals';

/**
 * The goals, under the record.
 *
 * They are on this screen because a goal is a thing you FOLLOW, and this is the screen for
 * following things: the same card, the same plot, the same resting-reading line as the four period
 * cards above. What they are not is a thing you do — the doing is on Today, where the check-in
 * asks — so nothing here is tickable and nothing here is a control.
 *
 * They sit BELOW the closing degrees note rather than among the period cards, and the note is why.
 * It defines a full orbit as 360°, which is the unit every instrument above it is drawn in; a
 * kilogram chart under that sentence would read as captioned by it. A goal counts in its own
 * units, so it follows the note as its own region rather than joining a run of cards that share
 * one.
 *
 * No section label. The card's header names it, which is the rule the period cards already keep —
 * "the period names the card, and nothing else does" ({@link OverTime}).
 */
function Goals({ live, checkIns, today }: { live: GoalReading[]; checkIns: GoalCheckIn[]; today: string }) {
  if (live.length === 0) return null;
  return (
    <View style={styles.goals}>
      {live.map((reading) => (
        <GoalTrendChart
          key={reading.goal.id}
          title={reading.goal.title}
          // The standing, worded correctly in both directions — `goalMeta` already knows whether
          // this is "1,240 of 9,060 lines" or "82.4 kg · 7.4 left in Rajab".
          readout={goalMeta(reading, today)}
          series={goalSeries(reading.goal.id, checkIns)}
          target={reading.goal.target_value}
          unit={reading.goal.unit}
          today={today}
          onPress={() => router.push({ pathname: '/(tabs)/progress/goal/[id]', params: { id: reading.goal.id } })}
        />
      ))}
    </View>
  );
}

/**
 * Progress — where this month stands now, the record over time, then the goals.
 */
export default function ProgressScreen() {
  const { loading, error, dismissError, refresh, habitsCount, month, trend, seriesByPeriod, seriesPeriods, goals, today } =
    useProgress();
  const { checkIns, refresh: refreshGoals, error: goalsError, dismissError: dismissGoalsError } = useGoals();

  const { refreshControl } = usePullToRefresh(() => Promise.all([refresh(), refreshGoals()]));

  // Re-read the goals whenever this tab comes forward. `useProgress` is a hook, so every screen
  // holding one holds its own instance — and a goal is set on Today, in another tab, while this
  // one sits mounted behind it. Re-reading on focus makes the list correct by construction rather
  // than by trusting a propagation path. (The same rule the plans list and Insights follow.)
  useFocusEffect(
    useCallback(() => {
      void refreshGoals();
    }, [refreshGoals]),
  );

  if (loading) {
    return (
      <AppScreen transparent>
        <ProgressSkeleton />
      </AppScreen>
    );
  }

  if (habitsCount === 0) {
    // A FAILED first load also lands here with zero habits — that's a network problem, not a
    // fresh account, and the invitation below would misread it. Worse, this branch mounts no
    // refreshControl, so the error's "pull down to try again" would be impossible. Offer an
    // explicit retry instead (mirrors the Habits screen's load-failed state).
    if (error) {
      return (
        <AppScreen transparent centered>
          {/* Not `body={error}`: the hook's one error string says "pull down to try again",
              which is impossible here (no refreshControl on this branch) and would repeat the
              title. Name the fix this branch actually offers. */}
          <EmptyState icon="cloudOff" title="Couldn't load your progress" body="Check your connection, then try again.">
            <AppButton onPress={() => void refresh()} accessibilityLabel="Try loading again">
              Try again
            </AppButton>
          </EmptyState>
        </AppScreen>
      );
    }
    return (
      <AppScreen transparent>
        {/* Says what to DO. The line's "starts on the second day" used to be here too — a fact
            about a chart that isn't on screen yet, explained to someone with no record to draw
            one from. The chart says it itself ("Your line begins tomorrow"), in the empty plot,
            on the day it matters. */}
        <EmptyState
          icon="stats"
          title="Your line begins here"
          body="Anchor a habit and keep it. The record draws itself as the days go.">
          <BrowseHabitsButton />
        </EmptyState>
      </AppScreen>
    );
  }

  return (
    <AppScreen transparent refreshControl={refreshControl}>
      <ErrorBanner message={error} onDismiss={dismissError} />
      <ErrorBanner message={goalsError} onDismiss={dismissGoalsError} />

      <MonthSummary month={month} />

      {/* One card per period the record can be read at — Week, Month, Year, Lifetime — and only
          the ones a wider period doesn't already draw. Only one scale is ever *in* a card, so a
          figure is never set beside one measured against a different span. */}
      <OverTime seriesByPeriod={seriesByPeriod} periods={seriesPeriods} trend={trend} />

      {/* The unit, once, for the whole screen.
          The bucket is named beside every figure; this closing note defines the shared unit once. */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        A full orbit is 360° — everything the span asked for, kept. Touch a line to read any point
        on it.
      </ThemedText>

      {/* A goal you have put down keeps its record but leaves this list: it is asking nothing of
          the month, and a list of live goals is only useful if everything on it is live. */}
      <Goals live={goals.filter((reading) => reading.goal.status !== 'released')} checkIns={checkIns} today={today} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  // Hung on the card edge, like every other closing caption in the app (SettingsSection's footer,
  // the reading screen's note).
  note: { marginLeft: Spacing.three, marginRight: Spacing.three },
  // Their own region, set off from the note that closes the degree instruments. The gap rides
  // on top of AppScreen's own child gap, the same way the Insights archive's did.
  goals: { gap: Spacing.three, marginTop: Spacing.three },
});
