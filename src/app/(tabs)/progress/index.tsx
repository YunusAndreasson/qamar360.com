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
