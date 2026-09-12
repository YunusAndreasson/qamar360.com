import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
import { useLocalInsights, useLocalInsightArchive } from '@/hooks/use-local-insights';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { scheduledActs, type Reading } from '@/lib/insights';
import { PHASE_LABEL } from '@/lib/local-insight-job';

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
      <ThemedText type="smallCompactBold">{value}</ThemedText>
    </View>
  );
}

function DeeperReflection({
  reading,
  habits,
  goals,
  live,
}: {
  reading: Reading;
  habits: ReturnType<typeof useProgress>['habits'];
  goals: ReturnType<typeof useProgress>['goals'];
  live: boolean;
}) {
  const theme = useTheme();
  const { insight, versions, selected, select, generate, cancel, job, elsewhere, error, snapshot, history } = useLocalInsights(
    reading,
    habits,
    goals,
    live,
  );
  const [showVersions, setShowVersions] = useState(false);
  const percent = job ? Math.round(job.fraction * 100) : 0;

  return (
    <StatCard>
      <StatCardHeader title="A deeper reflection" trailing={insight?.used_notes ? 'With your notes' : undefined} />
      <ThemedText type="small" themeColor="textSecondary">
        Generated on this device. Each new version can build on your earlier reflections.
      </ThemedText>
      {snapshot ? (
        <ThemedText type="small" themeColor="textSecondary">
          Records saved {new Date(snapshot.capturedAt).toLocaleString()}
          {live ? '' : ' · Using saved records'}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      ) : null}
      {job ? (
        <View
          style={styles.writing}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={PHASE_LABEL[job.phase]}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <View style={styles.line}>
            <ThemedText type="smallBold">{PHASE_LABEL[job.phase]}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {percent}%
            </ThemedText>
          </View>
          <View style={[styles.track, { backgroundColor: theme.accentTrack }]}>
            <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.accent }]} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {job.background ? 'You can leave the app while it writes.' : 'Keep the app open until it finishes.'}
          </ThemedText>
        </View>
      ) : null}
      {job && job.draft.length > 0 ? (
        <View style={styles.paragraphs}>
          {job.draft.map((paragraph, index) => (
            <ThemedText key={index} themeColor="textSecondary">
              {paragraph}
            </ThemedText>
          ))}
        </View>
      ) : null}
      {insight && !job ? (
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
      ) : null}
      {insight && !job ? (
        <ThemedText type="small" themeColor="textSecondary">
          {new Date(insight.generated_at).toLocaleString()} ·{' '}
          {insight.origin === 'legacy' ? 'Earlier cloud reflection' : 'On this device'}
        </ThemedText>
      ) : null}
      {insight && !job && insight.sourceIds.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Builds on:{' '}
          {insight.sourceIds
            .map((id) => history.find((v) => v.id === id))
            .filter((v) => v !== undefined)
            .map((v) => `${v.reading_id} (${new Date(v.generated_at).toLocaleDateString()})`)
            .join(', ')}
        </ThemedText>
      ) : null}
      {job ? (
        <AppButton variant="secondary" onPress={cancel}>
          Cancel
        </AppButton>
      ) : (
        <AppButton onPress={generate} disabled={elsewhere || !snapshot}>
          {insight ? 'Generate another version' : 'Generate reflection'}
        </AppButton>
      )}
      {elsewhere ? (
        <ThemedText type="small" themeColor="textSecondary">
          Another quarter’s reflection is being written. This one can start when it finishes.
        </ThemedText>
      ) : null}
      <AppButton variant="secondary" onPress={() => router.push('/settings')}>
        Manage local model
      </AppButton>
      {versions.length > 1 ? (
        <AppButton variant="secondary" onPress={() => setShowVersions(!showVersions)}>
          Previous versions ({versions.length})
        </AppButton>
      ) : null}
      {showVersions
        ? versions.map((version, index) => (
            <AppButton
              key={version.id}
              variant="secondary"
              onPress={() => {
                select(version.id);
                setShowVersions(false);
              }}
              accessibilityLabel={`Version ${versions.length - index}, ${new Date(version.generated_at).toLocaleString()}${version.id === selected ? ', selected' : ''}`}
            >
              Version {versions.length - index} · {new Date(version.generated_at).toLocaleString()}
              {version.id === selected ? ' · Selected' : ''}
            </AppButton>
          ))
        : null}
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
  const archive = useLocalInsightArchive();
  const { loading, error, dismissError, refresh, readings, habits, goals, insightInputsReady } = useProgress();
  const { refreshControl } = usePullToRefresh(refresh);

  const freshReading = readings.find((r) => r.id === id);
  const reading = freshReading ?? (id ? archive?.snapshots[id]?.reading : undefined) ?? null;
  // The id can go stale under you — a habit deleted from another tab can take a quarter's whole
  // record with it. Leave rather than sit on a screen about nothing (the same guard the per-act
  // stats screen uses).
  useBackIfStale(!loading && reading === null);

  if (loading && !reading) {
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
      <DeeperReflection
        key={reading.id}
        reading={reading}
        habits={habits}
        goals={goals}
        live={insightInputsReady && Boolean(freshReading)}
      />
      <QuarterComparison reading={reading} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  comparison: { gap: Spacing.two },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.three },
  writing: { gap: Spacing.two },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%' },
  reflectionError: { gap: Spacing.two, alignItems: 'flex-start' },
  retry: { minWidth: 0 },
  paragraphs: { gap: Spacing.three },
  nextStep: { gap: Spacing.one, padding: Spacing.three, borderRadius: Radius.control },
  evidence: { gap: Spacing.one, paddingTop: Spacing.one },
});
