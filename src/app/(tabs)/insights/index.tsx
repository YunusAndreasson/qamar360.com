import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { MoonPhase } from '@/components/moon-phase';
import { NextReadingCard } from '@/components/next-reading-card';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { InsightsSkeleton } from '@/components/progress-skeleton';
import { ReadingCard, readingDaysLabel, readingMoonBrightness, readingSpanLabel } from '@/components/reading-card';
import { SettingsSection } from '@/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocalInsightArchive } from '@/hooks/use-local-insights';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { latestReadingId, nextReadingDue, type Reading } from '@/lib/insights';
import { setPreference } from '@/lib/preferences';


/**
 * One earlier reading, as a line. A moon at the phase it went out under, the claim it led with,
 * and the days it covers — enough to recognise a night you were told about, and to pick one out
 * of a year of them.
 *
 * The chevron is right here under the house rule: it means *there is more of this to read*, which
 * is exactly what the row opens. (A row that merely acted would carry `⋯` instead.)
 */
function ReadingRow({ reading }: { reading: Reading }) {
  const theme = useTheme();
  return (
    <Touchable
      onPress={() => router.push({ pathname: '/(tabs)/insights/[id]', params: { id: reading.id } })}
      androidRipple={{ color: theme.backgroundSelected }}
      underlayColor={theme.backgroundSelected}
      activeUnderlayOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={`${reading.phaseLabel}, ${readingSpanLabel(reading)}. ${reading.lead.headline}`}
      accessibilityHint="Opens the reading in full"
      style={styles.row}>
      <MoonPhase
        illumination={reading.illumination}
        waxing={reading.waxing}
        size={26}
        brightness={readingMoonBrightness(reading)}
        rim
      />
      <View style={styles.rowText}>
        <ThemedText type="rowTitle" numberOfLines={2}>
          {reading.lead.headline}
        </ThemedText>
        {/* The month is struck from the caption because the section above the row has just said
            it. The a11y label above keeps it: a screen reader can land on a row without the
            group's header in play, where "1–7" alone would be a span of nothing. */}
        <ThemedText type="small" themeColor="textSecondary">
          {reading.phaseLabel} · {readingDaysLabel(reading)}
        </ThemedText>
      </View>
      <AppIcon name="chevronRight" size={16} color={theme.textSecondary} />
    </Touchable>
  );
}

/**
 * The earlier readings, cut into the Hijri months they are about — newest month first, which is
 * the order they already arrive in ({@link computeReadings} returns newest first, and a month's
 * four quarters with it), so one pass with no sorting keeps the feed's order exactly.
 *
 * A year of quarters is ~48 rows, and a flat run of them is a wall: every row is a claim about a
 * span, none of them says which part of the year you are looking at, and the only way to find the
 * month you remembered was to read every headline on the way down. A month is the unit this whole
 * feature is written in — the orbit measures one, the four moons quarter one — so it is the unit
 * the back-catalogue is filed under.
 */
function byMonth(readings: Reading[]): { key: string; label: string; readings: Reading[] }[] {
  const groups: { key: string; label: string; readings: Reading[] }[] = [];
  for (const reading of readings) {
    const key = `${reading.span.year}-${reading.span.monthNumber}`;
    const open = groups.at(-1);
    if (open?.key === key) open.readings.push(reading);
    else groups.push({ key, label: `${reading.span.monthName} ${reading.span.year}`, readings: [reading] });
  }
  return groups;
}

/**
 * Insights — what the moon has to say about the quarter just gone.
 *
 * The shape is the one people already know from a weekly summary (Jakob's Law): the newest entry
 * in full at the top, everything before it as a scannable list, and a tap for the whole thing.
 * Deliberately not a story carousel — a reading is something you re-read, not something that
 * plays.
 *
 * The newest concrete finding is the first object on the screen with any weight. Above it sits one
 * caption-weight row saying when the next reading lands — a schedule of four moons a month is
 * knowable, and a feature that speaks only four times a month has to say when it will speak next.
 * The live monthly orbit still belongs to Progress; putting a GAUGE here made the clock visually
 * outrank the thing this tab is for, which is why the answer is a line and not a dial.
 */

export default function InsightsScreen() {
  const { loading, error, dismissError, refresh, habitsCount, month, readings, today } = useProgress();
  const archive = useLocalInsightArchive();
  const availableReadings = useMemo(() => {
    const byId = new Map(Object.values(archive?.snapshots ?? {}).map((s) => [s.reading.id, s.reading]));
    readings.forEach((reading) => byId.set(reading.id, reading));
    return [...byId.values()].sort((a, b) => b.span.startISO.localeCompare(a.span.startISO));
  }, [archive, readings]);
  const hasSaved = Object.keys(archive?.snapshots ?? {}).length > 0;
  const { refreshControl } = usePullToRefresh(refresh);
  // Purely calendrical, like the tab bar's dot: no completions, no habits, nothing to await. Null
  // only where the Umm al-Qura calendar is missing, which the branch below already has a screen
  // for — but a saved archive can reach the feed on such a device, so the card stays conditional.
  const due = nextReadingDue(today);

  // Looking at the tab IS reading it — stamp the quarter that has closed, and the tab bar's dot
  // goes out. Stamped from the calendar rather than from `readings[0]`, so the "no quarter has
  // closed yet" state clears the dot too: there is nothing there to come back for.
  useFocusEffect(
    useCallback(() => {
      const latest = latestReadingId(today);
      if (latest) setPreference('insightsSeen', latest);
    }, [today]),
  );

  if (loading && !hasSaved) {
    return (
      <AppScreen transparent>
        <InsightsSkeleton />
      </AppScreen>
    );
  }

  if (habitsCount === 0 && !hasSaved) {
    // A FAILED first load also lands here with zero habits — that's a network problem, not a
    // fresh account, and the moons copy would misread it. This branch mounts no refreshControl,
    // so "pull down to try again" would be impossible; offer an explicit retry instead.
    if (error) {
      return (
        <AppScreen transparent centered>
          <EmptyState icon="cloudOff" title="Couldn't load your insights" body="Check your connection, then try again.">
            <AppButton onPress={() => void refresh()} accessibilityLabel="Try loading again">
              Try again
            </AppButton>
          </EmptyState>
        </AppScreen>
      );
    }
    return (
      <AppScreen transparent>
        <EmptyState
          art={<MoonEmblem />}
          title="Nothing to read yet"
          body="Anchor a habit and keep it. Each quarter brings a short reading of what changed.">
          <BrowseHabitsButton />
        </EmptyState>
      </AppScreen>
    );
  }

  // A reading is a Hijri span, so a runtime whose `Intl` lacks the Umm al-Qura calendar has no
  // quarters to write about and no month to draw. Name what is missing rather than show a screen
  // that is silently empty for a reason nobody could guess.
  if (month === null && !hasSaved) {
    return (
      <AppScreen transparent centered>
        <EmptyState
          icon="cloudOff"
          title="Insights need the Islamic calendar"
          body="This device is missing the Islamic (Umm al-Qura) calendar that the moons, months and quarters are measured in."
        />
      </AppScreen>
    );
  }

  // Only closed quarters are read. The one being lived has a reading too — the notifications arm
  // from it days ahead — but showing a verdict on a week that is still happening would be a guess
  // dressed as a finding.
  const closed = availableReadings.filter((r) => r.closed);
  const [newest, ...earlier] = closed;
  return (
    <AppScreen transparent refreshControl={refreshControl}>
      <ErrorBanner message={error} onDismiss={dismissError} />

      {/* When the next one lands. First in reading order because it is the one thing on this screen
          about the future, and a sibling of the record rather than part of it: the region below is
          quarters that have CLOSED, and a countdown filed among them would be the one row in the
          archive that is not history. It takes AppScreen's own 16pt child rhythm, which is the same
          step `region` uses internally — so the break that actually marks something is still the
          archive's doubled one, and this stays a masthead rather than a section of its own. */}
      {due ? <NextReadingCard due={due} /> : null}

      {/* The record, as one region: the newest finding and the archive behind it are both about
          months that are closed, and the archive keeps its own break inside that so it still reads
          as a back-catalogue rather than as a peer of the newest finding. */}
      <View style={styles.region}>
        {newest ? (
          <>
            <ReadingCard reading={newest} onPress={() => router.push({ pathname: '/(tabs)/insights/[id]', params: { id: newest.id } })} />
            {/* Older readings remain recognizable by month, but begin below a larger proximity
                break so they read as an archive rather than as peers of the newest finding. */}
            {earlier.length > 0 ? (
              <View style={styles.record}>
                {byMonth(earlier).map((group) => (
                  <SettingsSection key={group.key} title={group.label}>
                    {group.readings.map((reading) => (
                      <ReadingRow key={reading.id} reading={reading} />
                    ))}
                  </SettingsSection>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          // Habits exist, but no quarter has closed yet. WHEN the first one lands is said by the
          // card above, in days rather than in prose, so this only has to say what will arrive —
          // the wait already has a date on it, which is what separates it from an empty screen.
          <EmptyState
            icon="stats"
            title="No quarter has closed yet"
            body="Each quarter of the moon gets one reading of what changed over it."
          />
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
  // The closed record — the newest reading and the archive under it — spaced like AppScreen's own
  // children, since it is the whole of the screen below the banner.
  region: { gap: Spacing.three },
  // The back-catalogue, as one region. `marginTop` rides on top of `region`'s 16pt gap.
  record: { gap: Spacing.three, marginTop: Spacing.three },
});
