import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { MonthMoons } from '@/components/month-moons';
import { MonthSummary } from '@/components/month-summary';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { YearTrend } from '@/components/year-trend';
import { useProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';

export default function ProgressScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { loading, error, dismissError, refresh, habitsCount, month, year } = useProgress();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading) {
    return (
      <AppScreen transparent>
        <ProgressSkeleton />
      </AppScreen>
    );
  }

  if (habitsCount === 0) {
    return (
      <AppScreen transparent centered>
        <EmptyState
          art={<MoonEmblem />}
          title="Your moons will rise here"
          body="Add a habit on Today and complete it — each day fills a moon across your month.">
          <AppButton onPress={() => router.navigate('/habits/discover')} accessibilityLabel="Browse habits">
            Browse habits
          </AppButton>
        </EmptyState>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      transparent
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.textSecondary}
          colors={[theme.accent]}
          progressBackgroundColor={theme.backgroundElement}
        />
      }>
      <ErrorBanner message={error} onDismiss={dismissError} />

      <MonthSummary month={month} />

      <MonthMoons month={month} />

      <YearTrend year={year} />
    </AppScreen>
  );
}
