import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { MonthSummary } from '@/components/month-summary';
import { MoonPhase } from '@/components/moon-phase';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { ProgressSkeleton } from '@/components/progress-skeleton';
import { ReadingCard, readingSpanLabel } from '@/components/reading-card';
import { SettingsSection } from '@/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { latestReadingId, type Reading } from '@/lib/insights';
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
      <MoonPhase illumination={reading.illumination} waxing={reading.waxing} size={26} rim />
      <View style={styles.rowText}>
        <ThemedText type="rowTitle" numberOfLines={2}>
          {reading.lead.headline}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {reading.phaseLabel} · {readingSpanLabel(reading)}
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
 * The month's orbit heads the screen because the moon is the clock all of this is written on: the
 * live reading of where you are, above the finished readings of where you have been.
 */
export default function InsightsScreen() {
  const { loading, error, dismissError, refresh, habitsCount, month, readings, today } = useProgress();
  const { refreshControl } = usePullToRefresh(refresh);

  // Looking at the tab IS reading it — stamp the quarter that has closed, and the tab bar's dot
  // goes out. Stamped from the calendar rather than from `readings[0]`, so the "your first reading
  // is on its way" state clears the dot too: there is nothing there to come back for.
  useFocusEffect(
    useCallback(() => {
      const latest = latestReadingId(today);
      if (latest) setPreference('insightsSeen', latest);
    }, [today]),
  );

  if (loading) {
    return (
      <AppScreen transparent>
        <ProgressSkeleton />
      </AppScreen>
    );
  }

  if (habitsCount === 0) {
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
          title="Your moons will rise here"
          body="Anchor a habit and keep it. The orbit fills as the month goes, and every quarter of the moon brings a reading of it.">
          <BrowseHabitsButton />
        </EmptyState>
      </AppScreen>
    );
  }

  // A reading is a Hijri span, so a runtime whose `Intl` lacks the Umm al-Qura calendar has no
  // quarters to write about and no month to draw. Name what is missing rather than show a screen
  // that is silently empty for a reason nobody could guess.
  if (month === null) {
    return (
      <AppScreen transparent centered>
        <EmptyState
          icon="cloudOff"
          title="Insights need the Islamic calendar"
          body="This device's system is missing Islamic (Umm al-Qura) calendar support, which the moons, months and quarters are measured in."
        />
      </AppScreen>
    );
  }

  // Only closed quarters are read. The one being lived has a reading too — the notifications arm
  // from it days ahead — but showing a verdict on a week that is still happening would be a guess
  // dressed as a finding.
  const closed = readings.filter((r) => r.closed);
  const [newest, ...earlier] = closed;

  return (
    <AppScreen transparent refreshControl={refreshControl}>
      <ErrorBanner message={error} onDismiss={dismissError} />

      <MonthSummary month={month} />

      {newest ? (
        <>
          <ReadingCard reading={newest} onPress={() => router.push({ pathname: '/(tabs)/insights/[id]', params: { id: newest.id } })} />
          {/* One card per Hijri month, under its own name. The label used to be a single "EARLIER"
              over every reading ever written; it named the pile rather than anything in it, and
              said nothing a reader could navigate by. The months do both — they say what is below
              them AND where in the record you have scrolled to. */}
          {byMonth(earlier).map((group) => (
            <SettingsSection key={group.key} title={group.label}>
              {group.readings.map((reading) => (
                <ReadingRow key={reading.id} reading={reading} />
              ))}
            </SettingsSection>
          ))}
        </>
      ) : (
        // Habits exist, but no quarter has closed yet. Say when the first one will — a wait with
        // a date on it is a different thing from an empty screen.
        <EmptyState
          icon="stats"
          title="Your first reading is on its way"
          body={`Every quarter of the moon — the 1st, 8th, 15th and 22nd of ${month.monthName} — brings a reading of the days before it, set against the quarter before that.`}
        />
      )}
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
});
