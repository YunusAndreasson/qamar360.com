import { StyleSheet } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { MonthBars } from '@/components/month-bars';
import { MonthSummary } from '@/components/month-summary';
import { YearBars } from '@/components/year-bars';
import { Spacing } from '@/constants/theme';
import { useProgress } from '@/hooks/use-progress';

export default function ProgressScreen() {
  const { loading, error, dismissError, habitsCount, month, year } = useProgress();

  if (loading) {
    return <AppScreen loading />;
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
    <AppScreen contentStyle={styles.content}>
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
