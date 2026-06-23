import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HabitProgressRow } from '@/components/habit-progress-row';
import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeekBars } from '@/components/week-bars';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';

export default function ProgressScreen() {
  const theme = useTheme();
  const { loading, error, dismissError, habitsCount, week, totals, perHabit, streak, streakCapped } =
    useProgress();

  // Auto-dismiss the error banner so a transient failure doesn't linger (matches Habits).
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(dismissError, 4000);
    return () => clearTimeout(timer);
  }, [error, dismissError]);

  const streakLabel =
    streak === 0
      ? 'Complete all your habits today to start a streak'
      : streakCapped
        ? `${streak}+ day perfect streak`
        : `${streak}-day perfect streak`;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Progress</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Last 7 days
          </ThemedText>
        </View>

        {error ? (
          <Pressable
            onPress={dismissError}
            accessibilityRole="button"
            accessibilityLabel={`${error} Tap to dismiss.`}
            style={styles.banner}>
            <ThemedText type="small" style={styles.bannerText}>
              {error}
            </ThemedText>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.textSecondary} />
          </View>
        ) : habitsCount === 0 ? (
          <EmptyState />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <StatCard style={styles.hero}>
              <View style={styles.heroHeader}>
                <ThemedText type="default" numberOfLines={1} style={styles.cardTitle}>
                  This week
                </ThemedText>
                <ThemedText type="subtitle" accessibilityLabel={`${totals.percent} percent completed`}>
                  {totals.percent}%
                </ThemedText>
              </View>

              <WeekBars days={week} />

              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {totals.completed} of {totals.possible} completions
              </ThemedText>

              <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

              <View style={styles.streakRow} accessible accessibilityLabel={streakLabel}>
                {streak > 0 ? <ThemedText type="default">🔥</ThemedText> : null}
                <ThemedText
                  type={streak > 0 ? 'default' : 'small'}
                  style={[styles.streakText, streak === 0 && { color: theme.textSecondary }]}>
                  {streakLabel}
                </ThemedText>
              </View>
            </StatCard>

            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
              HABITS
            </ThemedText>
            <StatCard style={styles.habitsCard}>
              {perHabit.map((habit, i) => (
                <View key={habit.id}>
                  {i > 0 ? (
                    <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
                  ) : null}
                  <HabitProgressRow progress={habit} />
                </View>
              ))}
            </StatCard>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
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
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.half,
  },
  banner: {
    backgroundColor: '#e5484d',
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
  },
  bannerText: { color: '#ffffff' },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  hero: { gap: Spacing.three },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardTitle: { flex: 1, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  streakText: { flex: 1, fontWeight: '600' },
  sectionLabel: { marginLeft: Spacing.one, letterSpacing: 0.5, fontWeight: '700' },
  habitsCard: { paddingVertical: Spacing.one },
  empty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    gap: Spacing.one,
  },
  emptyText: { textAlign: 'center' },
});
