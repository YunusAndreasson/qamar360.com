import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { JournalSkeleton } from '@/components/journal-skeleton';
import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useNotes } from '@/hooks/use-notes';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { groupByMonth, matchesQuery, noteDateTitle, notePreview, spokenLabel, type DailyNote } from '@/lib/notes';

/** How much of an entry an archive row shows. Longer than a one-line preview because two lines is
 *  what tells two quiet evenings apart when you are scanning for one of them. */
const PREVIEW_CHARS = 140;
const PREVIEW_LINES = 2;

/**
 * The Journal — everything written, newest first.
 *
 * This is the answer to "where do my notes go", and it is deliberately the least inventive screen
 * in the app: a reverse-chronological list grouped by month, with a search field at the top. That
 * is the shape of Notes, of Day One, of every message thread anyone has ever scrolled, which means
 * it needs no learning at all. A diary is not the place to be clever about navigation.
 *
 * It is also the only route past the day-stepper's thirty days — Today can reach back a month, and
 * everything before that lives here.
 *
 * Reached from the quiet "Past notes" row at the foot of the day. Tapping an entry steps Today to
 * that day rather than opening a second editor: the note already has a home, and giving it two
 * would be two places to edit the same words.
 */
export default function JournalScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { today } = useHabits();
  const { archive, archiveLoading, loadArchive, error, dismissError } = useNotes();
  const [query, setQuery] = useState('');

  // On focus rather than on mount, so a note written on Today while this screen sits underneath in
  // the stack is on the list when you come back to it. The provider's `archiveInFlight` guard is
  // what keeps this and the pull below from firing two identical SELECTs at each other.
  useFocusEffect(
    useCallback(() => {
      void loadArchive();
    }, [loadArchive]),
  );

  const { refreshControl } = usePullToRefresh(loadArchive);

  const months = useMemo(
    () => groupByMonth(archive.filter((n) => matchesQuery(n, query, today)), today),
    [archive, query, today],
  );

  // The entry opens in the same editor the foot of the day opens, carrying its own date. Not by
  // moving Today behind it: the stepper only reaches thirty days back (it is bounded by how far a
  // habit may be backfilled), and a journal that could only open the last month of itself would be
  // most of an archive and none of the point.
  const open = (note: DailyNote) => router.push({ pathname: '/habits/note', params: { day: note.note_date } });

  return (
    <>
      <Stack.Screen options={{ title: 'Journal' }} />

      {/* The native nav-bar search (UISearchController / SearchView), like Discover's — and pinned
          rather than hide-on-scroll, because the reason you came here is usually a word you
          remember rather than a date you can scroll to. */}
      <Stack.SearchBar
        placeholder="Search your notes"
        autoCapitalize="none"
        hideWhenScrolling={false}
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
        tintColor={theme.accent}
        textColor={theme.text}
        hintTextColor={theme.textSecondary}
        headerIconColor={theme.textSecondary}
      />

      {archiveLoading ? (
        <AppScreen transparent>
          <JournalSkeleton />
        </AppScreen>
      ) : error && archive.length === 0 ? (
        // A failed first load arrives here looking exactly like a diary nobody has started — and
        // "Nothing written yet" is a terrible thing to tell someone whose entries are all still
        // there and merely out of reach. So the failure gets its own state, the same one Today and
        // Progress raise, with the retry this screen would otherwise have no way to offer.
        // The message is not the hook's: it names the recovery that is actually on screen.
        <AppScreen transparent centered>
          <EmptyState
            icon="cloudOff"
            title="Couldn’t load your journal"
            body="Check your connection, then try again.">
            <AppButton onPress={() => void loadArchive()} accessibilityLabel="Try loading again">
              Try again
            </AppButton>
          </EmptyState>
        </AppScreen>
      ) : (
        // One screen for "nothing here" and "here it is", so the banner and the pull are wired once
        // and a later failure — a refresh, a delete — is visible over a list that is still good.
        <AppScreen transparent centered={months.length === 0} refreshControl={refreshControl}>
          <ErrorBanner message={error} onDismiss={dismissError} />
          {months.length === 0 ? (
            <EmptyState
              icon={query ? 'searchOff' : 'journal'}
              title={query ? 'Nothing found' : 'Nothing written yet'}
              body={
                query
                  ? 'No note has those words in it.'
                  : 'Notes you write at the foot of the day collect here, oldest kept as long as you keep them.'
              }
            />
          ) : null}
          {months.map((month) => (
            <View key={month.key} style={styles.month}>
              <SectionLabel>{month.label.toUpperCase()}</SectionLabel>
              <Surface>
                {month.notes.map((note, i) => (
                  <Fragment key={note.id}>
                    {i > 0 ? <RowSeparator /> : null}
                    <ArchiveRow note={note} today={today} onPress={open} />
                  </Fragment>
                ))}
              </Surface>
            </View>
          ))}
        </AppScreen>
      )}
    </>
  );
}

/** One day in the archive: its date, how long was spoken into it, and the opening of what it says.
 *  The date and the preview are each resolved once and used twice — the row shows them and the
 *  screen reader is handed the same two strings, rather than each caller recomputing them. */
function ArchiveRow({
  note,
  today,
  onPress,
}: {
  note: DailyNote;
  today: string;
  onPress: (note: DailyNote) => void;
}) {
  const theme = useTheme();
  const title = noteDateTitle(note.note_date, today);
  const preview = notePreview(note.body, PREVIEW_CHARS);
  const spoken = spokenLabel(note.spoken_seconds);

  return (
    <Touchable
      onPress={() => onPress(note)}
      androidRipple={{ color: theme.backgroundSelected }}
      underlayColor={theme.backgroundSelected}
      activeUnderlayOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${preview}`}
      accessibilityHint="Opens that day."
      style={styles.row}>
      <View style={styles.heading}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {spoken ? (
          <ThemedText type="small" themeColor="textSecondary">
            {spoken}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={PREVIEW_LINES}>
        {preview}
      </ThemedText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  month: { gap: Spacing.two, marginBottom: Spacing.four },
  // 56 is the row family's floor (`loose-row`, `task-row`, `note-section`), and it is only ever a
  // floor here: a heading over two lines of preview stands taller than that on its own, and a
  // one-line entry is the only thing the minimum ever has to catch.
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.half, minHeight: 56 },
  // The date and the duration on one line, pushed apart — so a column of rows reads as a column of
  // dates first, which is how anyone looks for a day they half-remember.
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
