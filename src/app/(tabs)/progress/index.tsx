import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { GoalTrendChart } from '@/components/goal-trend-chart';
import { MonthSummary } from '@/components/month-summary';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { OverTime } from '@/components/over-time';
import { ProgressSkeleton } from '@/components/progress-skeleton';
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
 * following things: the same card and the same plot as the period cards above. What they are not
 * is a thing you do — the doing is on Today, where the check-in asks — so nothing here is tickable
 * and nothing here is a control.
 *
 * They sit BELOW the period cards as their own region rather than among them: every card above
 * is drawn in one unit, a share of what the span asked for, and a goal counts in its own.
 *
 * No section label. The card's header names it, which is the rule the period cards already keep —
 * "the period names the card, and nothing else does" ({@link OverTime}).
 */
function Goals({ live, checkIns, today }: { live: GoalReading[]; checkIns: GoalCheckIn[]; today: string }) {
  if (live.length === 0) return null;
  return (
    <View style={styles.goals}>
      {live.map((reading) => {
        const href = { pathname: '/(tabs)/progress/goal/[id]', params: { id: reading.goal.id } } as const;
        const card = (
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
            // On iOS the `Link` below hands the card its press; everywhere else it opens the goal itself.
            onPress={Platform.OS === 'ios' ? undefined : () => router.push(href)}
          />
        );
        // iOS 18+ zooms the card into the goal it opens: the same line, grown into its own screen
        // (`Link.AppleZoomTarget` there). The zoom needs the navigation to go through a `Link`,
        // which tags the route with its source; below iOS 18 the system has no zoom, and it is a
        // plain push.
        return Platform.OS === 'ios' ? (
          <Link key={reading.goal.id} href={href} asChild>
            <Link.Trigger withAppleZoom>{card}</Link.Trigger>
          </Link>
        ) : (
          card
        );
      })}
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
  // than by trusting a propagation path. (The same rule the plans list follows.)
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
          <EmptyState icon="cloudOff" title="Could not load your progress" body="Check your connection, then try again.">
            <AppButton onPress={() => void refresh()} accessibilityLabel="Try loading again">
              Try again
            </AppButton>
          </EmptyState>
        </AppScreen>
      );
    }
    return (
      <AppScreen transparent>
        {/* Says what is missing, then what to DO. The line's "starts on the second day" used to
            be here too — a fact about a chart that isn't on screen yet, explained to someone with
            no record to draw one from. The chart says it itself, in the empty plot, on the day it
            matters. */}
        <EmptyState
          art={<MoonEmblem />}
          title="No record yet"
          body="Anchor your first stack and keep it.">
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

      {/* The zoom-out under the moon: this year month by month, then the whole record. Only one
          scale is ever *in* a card, so a figure is never set beside one measured against a
          different span. */}
      <OverTime seriesByPeriod={seriesByPeriod} periods={seriesPeriods} trend={trend} />

      {/* A goal you have put down keeps its record but leaves this list: it is asking nothing of
          the month, and a list of live goals is only useful if everything on it is live. */}
      <Goals live={goals.filter((reading) => reading.goal.status !== 'released')} checkIns={checkIns} today={today} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  // Their own region, set off from the period cards above. The gap rides on top of AppScreen's
  // own child gap.
  goals: { gap: Spacing.three, marginTop: Spacing.three },
});
