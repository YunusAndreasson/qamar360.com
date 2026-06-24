import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ErrorBanner } from '@/components/error-banner';
import { MonthBars } from '@/components/month-bars';
import { MonthSummary } from '@/components/month-summary';
import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeekBars } from '@/components/week-bars';
import { YearBars } from '@/components/year-bars';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';

export default function ProgressScreen() {
  const theme = useTheme();
  const { loading, error, dismissError, habitsCount, week, month, year } = useProgress();

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.textSecondary} />
      </ThemedView>
    );
  }

  if (habitsCount === 0) {
    return (
      <ThemedView style={styles.container}>
        <EmptyState />
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <ErrorBanner message={error} onDismiss={dismissError} />

      <MonthSummary month={month} />

      <StatCard style={styles.hero}>
        <View style={styles.heroHeader}>
          <ThemedText type="default" style={styles.cardTitle}>
            This week
          </ThemedText>
        </View>
        <WeekBars days={week} />
      </StatCard>

      <MonthBars month={month} />

      <YearBars year={year} />
    </ScrollView>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <ThemedText type="default" style={[styles.emptyText, { color: theme.textSecondary }]}>
        No habits yet.
      </ThemedText>
      <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
        Add some on the Habits tab to start tracking your progress.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  hero: { gap: Spacing.three },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' },
  cardTitle: { flex: 1, fontWeight: '600' },
  empty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    gap: Spacing.one,
  },
  emptyText: { textAlign: 'center' },
});
