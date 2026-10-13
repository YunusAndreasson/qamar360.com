import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
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
import {
  cancelInsightDownload,
  downloadInsightModel,
  insightModelState,
  refreshInsightModel,
  subscribeInsightModel,
} from '@/lib/local-insight-model';

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

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The reflection a model on this device generates from the quarter's saved records. The header
 * names where the shown version was generated, because imported versions came from the cloud.
 * "Generate" is the model's verb on every string here: Today's "Write today's reflection" is the
 * person's own journal entry, and the two must not read as the same act.
 */
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
  const { insight, versions, selected, select, generate, cancel, job, elsewhere, error, snapshot } = useLocalInsights(
    reading,
    habits,
    goals,
    live,
  );
  const model = useSyncExternalStore(subscribeInsightModel, insightModelState, insightModelState);
  useEffect(() => {
    void refreshInsightModel();
  }, []);
  const [showVersions, setShowVersions] = useState(false);
  const percent = job ? Math.round(job.fraction * 100) : 0;
  // While a new version is being generated, its draft takes the place of the saved one.
  const shown = job ? null : insight;
  const earlier = shown?.sourceIds.length ?? 0;

  return (
    <StatCard>
      <StatCardHeader
        title="Reflection"
        trailing={shown?.origin === 'legacy' ? 'Generated in the cloud' : 'Generated on this device'}
      />
      {!shown && !job ? (
        <ThemedText type="small" themeColor="textSecondary">
          A model reads this quarter’s records and generates a short reflection. Nothing is sent to a server.
        </ThemedText>
      ) : null}
      {!snapshot ? (
        <ThemedText type="small" themeColor="textSecondary">
          Go online once so this quarter’s records can be saved to this device.
        </ThemedText>
      ) : !live ? (
        <ThemedText type="small" themeColor="textSecondary">
          Offline. Using the records saved {when(snapshot.capturedAt)}.
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
          accessibilityLabel={`${PHASE_LABEL[job.phase]} on this device`}
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
            {job.background ? 'You can leave the app.' : 'Keep the app open until it finishes.'}
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
      {shown ? (
        <>
          <View style={styles.paragraphs}>
            {shown.paragraphs.map((paragraph, index) => (
              <ThemedText key={index}>{paragraph}</ThemedText>
            ))}
          </View>
          <View style={[styles.nextStep, { backgroundColor: theme.accentSubtle }]}>
            <ThemedText type="smallBold" themeColor="accent">
              NEXT QUARTER
            </ThemedText>
            <ThemedText type="defaultSemiBold">{shown.next_step}</ThemedText>
          </View>
          {shown.evidence ? (
            <View style={styles.evidence}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                QUOTED FROM THE HABIT’S SOURCE
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {shown.evidence}
              </ThemedText>
            </View>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {shown.origin === 'legacy'
              ? `Generated ${when(shown.generated_at)} by an earlier version of the app.`
              : `Generated ${when(shown.generated_at)}${shown.used_notes ? ', using your journal notes' : ''}.`}
            {earlier > 0 ? ` Builds on ${earlier} earlier ${earlier === 1 ? 'reflection' : 'reflections'}.` : ''}
          </ThemedText>
        </>
      ) : null}
      {job ? (
        <AppButton variant="secondary" onPress={cancel}>
          Cancel
        </AppButton>
      ) : model.busy ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Downloading the model: {Math.round(model.progress * 100)}%.
          </ThemedText>
          <AppButton variant="secondary" onPress={cancelInsightDownload}>
            Cancel download
          </AppButton>
        </>
      ) : model.known && !model.ready ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {model.error ?? 'Generating needs a one-time 2.7 GB download of the model.'}
          </ThemedText>
          {/* Downloaded right here: a trip to Settings lands at the top of a long page. */}
          <AppButton onPress={() => void downloadInsightModel()}>Download the model (2.7 GB)</AppButton>
        </>
      ) : (
        <AppButton onPress={generate} disabled={elsewhere || !snapshot || !model.ready}>
          {insight ? 'Generate another version' : 'Generate reflection'}
        </AppButton>
      )}
      {elsewhere ? (
        <ThemedText type="small" themeColor="textSecondary">
          Another quarter’s reflection is being generated. This one can start when it finishes.
        </ThemedText>
      ) : null}
      {versions.length > 1 && !job ? (
        <AppButton variant="secondary" onPress={() => setShowVersions(!showVersions)}>
          Versions ({versions.length})
        </AppButton>
      ) : null}
      {showVersions && !job
        ? versions.map((version, index) => {
            const label = `Version ${versions.length - index} · ${when(version.generated_at)}${version.origin === 'legacy' ? ' · cloud' : ''}`;
            return (
              <AppButton
                key={version.id}
                variant="secondary"
                onPress={() => {
                  select(version.id);
                  setShowVersions(false);
                }}
                accessibilityLabel={`${label}${version.id === selected ? ', selected' : ''}`}
              >
                {label}
                {version.id === selected ? ' · Selected' : ''}
              </AppButton>
            );
          })
        : null}
      {model.ready && !job ? (
        <AppButton variant="secondary" onPress={() => router.push('/settings')}>
          On-device settings
        </AppButton>
      ) : null}
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
  paragraphs: { gap: Spacing.three },
  nextStep: { gap: Spacing.one, padding: Spacing.three, borderRadius: Radius.control },
  evidence: { gap: Spacing.one, paddingTop: Spacing.one },
});
