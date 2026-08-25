import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { StatsSkeleton } from '@/components/progress-skeleton';
import { ReadingCard } from '@/components/reading-card';
import { SettingsSection } from '@/components/settings-section';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import type { Noticing, Reading } from '@/lib/insights';

/** One supporting noticing — the things the headline held back, each still said in full. */
function NoticingRow({ noticing }: { noticing: Noticing }) {
  return (
    <View style={styles.row}>
      <ThemedText type="rowTitle">{noticing.headline}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {noticing.body}
      </ThemedText>
    </View>
  );
}

/** How the quarter was actually spent, in whole days — the arithmetic under every figure above. */
function QuarterShape({ reading }: { reading: Reading }) {
  const { quarter } = reading;
  const run = quarter.longestRun;
  return (
    <StatCard>
      <StatCardHeader title="The quarter" trailing={`${quarter.span.days} days`} />
      <View style={styles.shape}>
        <Line label="Days closed in full" value={`${quarter.sealedDays} of ${quarter.span.days}`} />
        <Line label="Longest run" value={run ? `${run.days} ${run.days === 1 ? 'day' : 'days'}` : 'None yet'} />
        <Line label="Acts kept" value={`${Math.round(quarter.earned)} of ${quarter.possible}`} />
      </View>
    </StatCard>
  );
}

/**
 * One line of the arithmetic: what was counted on the left, what it came to on the right.
 *
 * The figure carries the weight. Label and value were both plain 14pt and told apart only by
 * colour, so three rows of evidence read as six equal fragments; bolding the values gives the card
 * a column you can run your eye down without reading a word of the left-hand side.
 */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallCompactBold">{value}</ThemedText>
    </View>
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
  const { loading, error, dismissError, refresh, readings } = useProgress();
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

      {reading.also.length > 0 ? (
        <SettingsSection title="Also this quarter">
          {reading.also.map((noticing) => (
            <NoticingRow key={noticing.kind} noticing={noticing} />
          ))}
        </SettingsSection>
      ) : null}

      <QuarterShape reading={reading} />

      {/* The unit, and nothing else. This used to open "Written at the first quarter, about 1–7
          Rabīʿ al-Awwal" — which is the screen's TITLE and the card's dateline, said a third time,
          at the bottom of a screen you reached by tapping that very phrase. What was left after
          striking it is the one thing here that appears nowhere else: what a full orbit means on
          this screen, since a quarter's 360° is not the month's 360° on the tab behind it. */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        A full orbit is 360° — the whole quarter kept.
      </ThemedText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.half, paddingVertical: Spacing.three, paddingLeft: Spacing.three, paddingRight: Spacing.three },
  shape: { gap: Spacing.two },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.three },
  note: { marginLeft: Spacing.three, marginRight: Spacing.three },
});
