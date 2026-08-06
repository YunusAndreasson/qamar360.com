import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { LifeYears } from '@/components/life-years';
import { MonthSummary } from '@/components/month-summary';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { YearTrend } from '@/components/year-trend';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

export default function ProgressScreen() {
  const { loading, error, dismissError, refresh, habitsCount, month, year, life, trend } = useProgress();

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
        <EmptyState
          art={<MoonEmblem />}
          title="Your moons will rise here"
          body="Add a habit and complete it — each day fills a moon across your month.">
          <BrowseHabitsButton />
        </EmptyState>
      </AppScreen>
    );
  }

  // A runtime whose `Intl` lacks the Umm al-Qura calendar derives no month and no year — every
  // card below would render null, leaving a wordless blank screen. Every layer beneath defends
  // against the missing calendar; this final composition must name it too.
  if (month === null && year === null) {
    return (
      <AppScreen transparent centered>
        <EmptyState
          icon="cloudOff"
          title="Progress needs the Islamic calendar"
          body="This device's system is missing Islamic (Umm al-Qura) calendar support, which the moons and months are measured in."
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen transparent refreshControl={refreshControl}>
      <ErrorBanner message={error} onDismiss={dismissError} />

      {/* Three scales, each one zoomed out from the last: the month you are in, the year it sits
          in, and every year on record. (The day-by-day moon grid used to sit between the first two;
          the hero already carries this month's figure, and the grid restated it a day at a time.) */}
      <MonthSummary month={month} />

      <YearTrend year={year} trend={trend} />

      <LifeYears life={life} />
    </AppScreen>
  );
}
