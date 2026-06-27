import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { MonthBars } from '@/components/month-bars';
import { MonthSummary } from '@/components/month-summary';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { YearBars } from '@/components/year-bars';
import { Spacing } from '@/constants/theme';
import { useProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';

export default function ProgressScreen() {
  const theme = useTheme();
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
      <AppScreen contentStyle={styles.content}>
        <ProgressSkeleton />
      </AppScreen>
    );
  }

  if (habitsCount === 0) {
    return (
      <AppScreen centered>
        <EmptyState
          title="No habits yet."
          body="Add a habit from Today to start tracking your progress."
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      contentStyle={styles.content}
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

      <MonthBars month={month} />

      <YearBars year={year} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
  },
});
