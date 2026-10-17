import { useSharedValue } from 'react-native-reanimated';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { LifetimeCard } from '@/components/lifetime-card';
import { MonthSummary } from '@/components/month-summary';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { YearCard } from '@/components/year-card';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

/**
 * Progress — where this month stands now, then the record over time.
 */
export default function ProgressScreen() {
  const { loading, error, dismissError, refresh, habitsCount, month, seriesByPeriod, seriesPeriods } = useProgress();
  // Where the moon's stripe is drawn, frame by frame: the hero writes it, and the Year card's
  // running month reads it, so this month fills in both places on one sweep.
  const stripe = useSharedValue(0);

  const { refreshControl } = usePullToRefresh(refresh);

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

      <MonthSummary month={month} stripe={stripe} />

      {/* The zoom-out under the moon: this year as its twelve moons, then the whole record. Only one
          scale is ever *in* a card, so a figure is never set beside one measured against a
          different span. */}
      {seriesPeriods.includes('year') ? <YearCard series={seriesByPeriod.year} stripe={stripe} /> : null}
      <LifetimeCard series={seriesByPeriod.life} />
    </AppScreen>
  );
}
