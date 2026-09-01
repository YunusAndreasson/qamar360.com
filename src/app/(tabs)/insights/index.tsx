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
import { MoonPhase } from '@/components/moon-phase';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { InsightsSkeleton } from '@/components/progress-skeleton';
import { ReadingCard, readingDaysLabel, readingMoonBrightness, readingSpanLabel } from '@/components/reading-card';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { useProgress } from '@/hooks/use-progress';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { goalMeta, type GoalReading } from '@/lib/goals';
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
 * The newest concrete finding is the first object on the screen. The live monthly orbit belongs
 * to Progress; putting it here made the clock visually outrank the thing this tab is for.
 */

/**
 * The goals, above the record.
 *
 * They sit on this tab because a goal is the same question the readings answer, asked forward:
 * this is where the record is read for what it means, and a horizon is a meaning the record is
 * being held to. It sits ABOVE the feed because it is the only thing on the screen that is about
 * a month still being lived — everything below it is closed and finished.
 *
 * Hidden entirely when there are none. A goal is not chrome the app owes you; it is something you
 * set, and until you have, the tab is exactly what it was.
 */
function Goals({ goals, today }: { goals: GoalReading[]; today: string }) {
  // A goal you have put down keeps its record but leaves the list: it is asking nothing of this
  // month, and a list of live goals is only useful if everything on it is live.
  const live = goals.filter((reading) => reading.goal.status !== 'released');
  if (live.length === 0) return null;
  return (
    <SettingsSection title="GOALS">
      {live.map((reading) => (
        <SettingsRow
          key={reading.goal.id}
          label={reading.goal.title}
          sublabel={goalMeta(reading, today)}
          showChevron
          onPress={() => router.push({ pathname: '/(tabs)/insights/goal/[id]', params: { id: reading.goal.id } })}
        />
      ))}
      <SetAGoalRow />
    </SettingsSection>
  );
}

/** The way in. Inside the goals card once there are goals, and alone at the foot of the screen
 *  until then — a horizon is something you set, not chrome the tab owes you. */
function SetAGoalRow() {
  return (
    <SettingsRow
      icon="add"
      label="Set a goal"
      sublabel="A horizon over acts you keep — ḥifẓ, a language, a weight"
      showChevron
      onPress={() => router.push('/(tabs)/insights/goal/new')}
    />
  );
}

export default function InsightsScreen() {
  const { loading, error, dismissError, refresh, habitsCount, month, readings, goals, today } = useProgress();
  const { refreshControl } = usePullToRefresh(refresh);
  const { refresh: refreshGoals } = useGoals();

  // Re-read the goals whenever this tab comes forward — the same rule the plans list follows.
  // A goal set from the composer lands in the provider, but this screen is one of several holding
  // its own `useProgress` instance, and a goal is also the one row here that another surface can
  // change while the tab sits mounted behind a modal. Re-reading on focus makes the list correct
  // by construction rather than by trusting a propagation path.
  useFocusEffect(
    useCallback(() => {
      void refreshGoals();
    }, [refreshGoals]),
  );

  // Looking at the tab IS reading it — stamp the quarter that has closed, and the tab bar's dot
  // goes out. Stamped from the calendar rather than from `readings[0]`, so the "no quarter has
  // closed yet" state clears the dot too: there is nothing there to come back for.
  useFocusEffect(
    useCallback(() => {
      const latest = latestReadingId(today);
      if (latest) setPreference('insightsSeen', latest);
    }, [today]),
  );

  if (loading) {
    return (
      <AppScreen transparent>
        <InsightsSkeleton />
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
  if (month === null) {
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
  const closed = readings.filter((r) => r.closed);
  const [newest, ...earlier] = closed;

  return (
    <AppScreen transparent refreshControl={refreshControl}>
      <ErrorBanner message={error} onDismiss={dismissError} />

      <Goals goals={goals} today={today} />

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
        // Habits exist, but no quarter has closed yet. Say when the first one will — a wait with
        // a date on it is a different thing from an empty screen.
        <EmptyState
          icon="stats"
          title="No quarter has closed yet"
          body={`Your first reading arrives when this quarter of ${month.monthName} closes.`}
        />
      )}

      {/* Below the record, and only while there is no goals card above to hold it. */}
      {goals.every((reading) => reading.goal.status === 'released') ? (
        <View style={styles.record}>
          <SettingsSection>
            <SetAGoalRow />
          </SettingsSection>
        </View>
      ) : null}
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
  // The back-catalogue, as one region. `marginTop` rides on top of AppScreen's own 16pt child gap.
  record: { gap: Spacing.three, marginTop: Spacing.three },
});
