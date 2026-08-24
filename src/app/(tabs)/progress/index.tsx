import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { OverTime } from '@/components/over-time';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

/**
 * Progress — the record as a line, over each period it can honestly be read at.
 *
 * One question, at four scales: which way am I going? The orbit that used to head this screen
 * moved to Insights with the rest of the moon: it answers a different question ("where am I in
 * *this* month?"), it is the clock the quarterly readings are written on, and two instruments
 * with two different denominators on one screen invited a comparison neither supports.
 */
export default function ProgressScreen() {
  const { loading, error, dismissError, refresh, habitsCount, trend, seriesByPeriod, seriesPeriods } = useProgress();

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

      {/* One card per period the record can be read at — Week, Month, Year, Lifetime — and only
          the ones a wider period doesn't already draw. Only one scale is ever *in* a card, so a
          figure is never set beside one measured against a different span. */}
      <OverTime seriesByPeriod={seriesByPeriod} periods={seriesPeriods} trend={trend} />
    </AppScreen>
  );
}
