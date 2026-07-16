import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { MonthMoons } from '@/components/month-moons';
import { MonthSummary } from '@/components/month-summary';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { YearTrend } from '@/components/year-trend';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

export default function ProgressScreen() {
  const { loading, error, dismissError, refresh, habitsCount, month, year } = useProgress();

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
    // fresh account, and the moons copy would misread it. Worse, this branch mounts no
    // refreshControl, so the error's "pull down to try again" would be impossible. Offer an
    // explicit retry instead (mirrors the Habits screen's load-failed state).
    if (error) {
      return (
        <AppScreen transparent centered>
          <EmptyState icon="cloudOff" title="Couldn't load your progress" body={error}>
            <AppButton onPress={() => void refresh()} accessibilityLabel="Try loading again">
              Try again
            </AppButton>
          </EmptyState>
        </AppScreen>
      );
    }
    return (
      <AppScreen transparent>
        <EmptyState
          art={<MoonEmblem />}
          title="Your moons will rise here"
          body="Add a habit on Today and complete it — each day fills a moon across your month.">
          <BrowseHabitsButton />
        </EmptyState>
      </AppScreen>
    );
  }

  return (
    <AppScreen transparent refreshControl={refreshControl}>
      <ErrorBanner message={error} onDismiss={dismissError} />

      <MonthSummary month={month} />

      <MonthMoons month={month} />

      <YearTrend year={year} />
    </AppScreen>
  );
}
