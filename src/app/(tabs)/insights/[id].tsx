import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { StatsSkeleton } from '@/components/progress-skeleton';
import { ReadingCard } from '@/components/reading-card';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { usePersonalizedInsight } from '@/hooks/use-personalized-insight';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { scheduledActs, type Reading } from '@/lib/insights';

/** The only arithmetic left on a reading: two recognizable counts, compared directly. */
function QuarterComparison({ reading }: { reading: Reading }) {
  const { quarter, previous } = reading;
  return (
    <StatCard>
      <StatCardHeader title="Quarter comparison" trailing={`${quarter.span.days} days`} />
      <View style={styles.comparison}>
        <Line label="This quarter" value={scheduledActs(quarter)} />
        {previous ? <Line label="Last quarter" value={scheduledActs(previous)} /> : null}
      </View>
    </StatCard>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}, ${value}`}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallCompactBold">
        {value}
      </ThemedText>
    </View>
  );
}

function DeeperReflection({
  reading,
  habits,
  goals,
}: {
  reading: Reading;
  habits: ReturnType<typeof useProgress>['habits'];
  goals: ReturnType<typeof useProgress>['goals'];
}) {
  const theme = useTheme();
  const { insight, loading, error, retry } = usePersonalizedInsight(reading, habits, goals);

  return (
    <StatCard>
      <StatCardHeader title="A deeper reflection" trailing={insight?.used_notes ? 'With your notes' : undefined} />
      {loading ? (
        <View style={styles.loading} accessible accessibilityLabel="Writing your deeper reflection">
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Reflecting on this quarter…
          </ThemedText>
        </View>
      ) : error || !insight ? (
        <View style={styles.reflectionError}>
          <ThemedText type="small" themeColor="textSecondary">
            {error ?? 'The deeper reflection is unavailable right now.'}
          </ThemedText>
          <AppButton variant="secondary" onPress={retry} style={styles.retry}>
            Try again
          </AppButton>
        </View>
      ) : (
        <>
          <View style={styles.paragraphs}>
            {insight.paragraphs.map((paragraph, index) => (
              <ThemedText key={index}>{paragraph}</ThemedText>
            ))}
          </View>
          <View style={[styles.nextStep, { backgroundColor: theme.accentSubtle }]}>
            <ThemedText type="smallBold" themeColor="accent">
              NEXT QUARTER
            </ThemedText>
            <ThemedText type="defaultSemiBold">{insight.next_step}</ThemedText>
          </View>
          {insight.evidence ? (
            <View style={styles.evidence}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                FROM YOUR HABIT’S SOURCE
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {insight.evidence}
              </ThemedText>
            </View>
          ) : null}
        </>
      )}
    </StatCard>
  );
}

/**
 * One moon quarter's reading, in full — reached from the feed, and straight from the notification
 * that announced it (`readingId` rides in the payload).
 *
 * Params carry only the id. The reading itself is recomputed from the record rather than passed
 * through the route: every tab mounts eagerly under `NativeTabs`, so the sweep this needs has
 * already run, and a frozen copy in a param could only ever disagree with it.
 */
export default function ReadingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { loading, error, dismissError, refresh, readings, habits, goals } = useProgress();
  const { refreshControl } = usePullToRefresh(refresh);

  const reading = readings.find((r) => r.id === id) ?? null;
  // The id can go stale under you — a habit deleted from another tab can take a quarter's whole
  // record with it. Leave rather than sit on a screen about nothing (the same guard the per-act
  // stats screen uses).
  useBackIfStale(!loading && reading === null);

  if (loading) {
    return (
      <AppScreen transparent>
        <StatsSkeleton />
      </AppScreen>
    );
  }

  if (!reading) {
    return (
      <AppScreen transparent centered>
        <EmptyState icon="searchOff" title="That reading is gone" body="The record it was written from has changed." />
      </AppScreen>
    );
  }

  return (
    <AppScreen transparent refreshControl={refreshControl}>
      <Stack.Screen options={{ title: reading.phaseLabel }} />
      <ErrorBanner message={error} onDismiss={dismissError} />

      <ReadingCard reading={reading} />
      <DeeperReflection reading={reading} habits={habits} goals={goals} />
      <QuarterComparison reading={reading} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  comparison: { gap: Spacing.two },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.three },
  loading: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  reflectionError: { gap: Spacing.two, alignItems: 'flex-start' },
  retry: { minWidth: 0 },
  paragraphs: { gap: Spacing.three },
  nextStep: { gap: Spacing.one, padding: Spacing.three, borderRadius: Radius.control },
  evidence: { gap: Spacing.one, paddingTop: Spacing.one },
});
