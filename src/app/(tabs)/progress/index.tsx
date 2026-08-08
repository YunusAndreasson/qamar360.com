import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { MonthSummary } from '@/components/month-summary';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { OverTime } from '@/components/over-time';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

export default function ProgressScreen() {
  const { loading, error, dismissError, refresh, habitsCount, month, trend, series } = useProgress();

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
          body="Anchor a habit and keep it. The orbit fills as the month goes, and your line starts on the second day.">
          <BrowseHabitsButton />
        </EmptyState>
      </AppScreen>
    );
  }

  // A runtime whose `Intl` lacks the Umm al-Qura calendar derives no month, so the hero — the
  // screen's primary instrument, and the whole reason completion is measured in orbits — cannot
  // render. The line below it would still draw (it counts days, not months), but a lone chart with
  // no explanation is a worse answer than naming what is missing.
  if (month === null) {
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
    <AppScreen transparent centered refreshControl={refreshControl}>
      <ErrorBanner message={error} onDismiss={dismissError} />

      {/* Two instruments, one question each. The orbit answers "where am I in this month?" against
          a mark that always exists — how far the month itself has got. The line answers "which way
          am I going?", at whichever scale the record can fill: days from the second day, months and
          years as they arrive. (Days, months and years were three separate cards; stacked line
          charts invited comparisons between scales that aren't comparable, and two of the three
          were empty for anyone new.) */}
      <MonthSummary month={month} />

      <OverTime series={series} trend={trend} />
    </AppScreen>
  );
}
