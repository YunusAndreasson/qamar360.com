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
import { useTheme } from '@/hooks/use-theme';
import type { Noticing, Reading } from '@/lib/insights';
import { toDegrees } from '@/lib/progress';

/**
 * One supporting noticing — the things the headline held back, each still said in full.
 *
 * Set a step below the lead rather than level with it. These were `rowTitle` (17pt), the house
 * size for a list row's primary label — but a noticing is not a row you can go anywhere from, it
 * is a paragraph, and at 17 against the lead's 18 a reading arrived as four headlines of equal
 * rank instead of one claim and its footnotes. `defaultSemiBold` is the app's existing size for a
 * heading INSIDE a body (see `guide-body.tsx`), which is exactly what this is.
 */
function NoticingRow({ noticing }: { noticing: Noticing }) {
  return (
    <View style={styles.row}>
      <ThemedText type="defaultSemiBold">{noticing.headline}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {noticing.body}
      </ThemedText>
    </View>
  );
}

/**
 * Every figure behind the reading, in one table.
 *
 * The quarter-on-quarter pair used to be a two-column readout inside the card above — on the feed
 * as well, where `pace` had already led with "Ahead of last quarter, 257° against 214°." and
 * followed with "A gain of 43°…", so the same two numbers were set out three times in one card.
 * They belong here, once, beside the rest of the arithmetic: the comparison first, because it is
 * the question the whole feature was asked for, then how the quarter was actually spent in days.
 *
 * "Acts kept" IS the degrees figure, arithmetically — 18 of 21 is 309°. It stays, because it is
 * the one place in the app where a degrees reading is decoded back into countable things. That is
 * a translation, not a repetition.
 */
function QuarterShape({ reading }: { reading: Reading }) {
  const theme = useTheme();
  const { quarter, previous } = reading;
  const run = quarter.longestRun;
  return (
    <StatCard>
      <StatCardHeader title="The quarter" trailing={`${quarter.span.days} days`} />
      <View style={styles.shape}>
        <View style={styles.group}>
          {/* Warm the instant the quarter was kept in full — the app's one colour rule for "done",
              borrowed exactly as the orbit uses it. There is deliberately no colour for the other
              direction: a figure that turned red at a quiet quarter would be the scold this app
              has a rule against, and the claim above has already said what happened, gently. */}
          <Line
            label="This quarter"
            value={`${toDegrees(quarter.rate)}°`}
            tone={quarter.rate >= 1 ? theme.complete : undefined}
          />
          <Line
            label={previous ? 'Last quarter' : 'No quarter before'}
            value={previous ? `${toDegrees(previous.rate)}°` : '—'}
            spoken={previous ? undefined : 'none to compare with'}
          />
        </View>
        {/* The same proximity step the feed uses between the present and the record, at card
            scale: two groups 16 apart, the lines inside a group 8. The comparison is one question
            and the shape of the quarter is another, and a flat run of five evenly-spaced lines
            said so nowhere. */}
        <View style={styles.group}>
          <Line label="Days closed in full" value={`${quarter.sealedDays} of ${quarter.span.days}`} />
          <Line label="Longest run" value={run ? `${run.days} ${run.days === 1 ? 'day' : 'days'}` : 'None yet'} />
          <Line label="Acts kept" value={`${Math.round(quarter.earned)} of ${quarter.possible}`} />
        </View>
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
function Line({ label, value, tone, spoken }: { label: string; value: string; tone?: string; spoken?: string }) {
  return (
    <View
      style={styles.line}
      accessible
      // Read as one fact rather than two fragments, and with the unit said out loud: "°" is a
      // symbol a screen reader either names or swallows. Same substitution the orbit sheet makes.
      accessibilityLabel={`${label}, ${spoken ?? value.replace('°', ' degrees')}`}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallCompactBold" style={tone ? { color: tone } : undefined}>
        {value}
      </ThemedText>
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
        A full orbit is 360°: the whole quarter kept.
      </ThemedText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.half, paddingVertical: Spacing.three, paddingLeft: Spacing.three, paddingRight: Spacing.three },
  // Two groups, 16 apart; the lines inside a group, 8. Twice the inner rhythm, which is what a
  // break needs to read as a break rather than as slack.
  shape: { gap: Spacing.three },
  group: { gap: Spacing.two },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.three },
  note: { marginLeft: Spacing.three, marginRight: Spacing.three },
});
