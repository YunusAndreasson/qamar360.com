import { Stack, useRouter } from 'expo-router';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { Skeleton } from '@/components/skeleton';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useNotes } from '@/hooks/use-notes';
import { useTheme } from '@/hooks/use-theme';
import { groupByMonth, matchesQuery, noteDateTitle, notePreview, spokenLabel, type DailyNote } from '@/lib/notes';

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

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

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
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </AppScreen>
      ) : months.length === 0 ? (
        <AppScreen transparent centered>
          <EmptyState
            icon={query ? 'searchOff' : 'journal'}
            title={query ? 'Nothing found' : 'Nothing written yet'}
            body={
              query
                ? 'No note has those words in it.'
                : 'Notes you write at the foot of the day collect here, oldest kept as long as you keep them.'
            }
          />
        </AppScreen>
      ) : (
        <AppScreen transparent>
          <ErrorBanner message={error} onDismiss={dismissError} />
          {months.map((month) => (
            <View key={month.key} style={styles.month}>
              <SectionLabel>{month.label.toUpperCase()}</SectionLabel>
              <Surface>
                {month.notes.map((note, i) => (
                  <Fragment key={note.id}>
                    {i > 0 ? <RowSeparator /> : null}
                    <Touchable
                      onPress={() => open(note)}
                      androidRipple={{ color: theme.backgroundSelected }}
                      underlayColor={theme.backgroundSelected}
                      activeUnderlayOpacity={1}
                      accessibilityRole="button"
                      accessibilityLabel={`${noteDateTitle(note.note_date, today)}. ${notePreview(note.body, 140)}`}
                      accessibilityHint="Opens that day."
                      style={styles.row}>
                      <View style={styles.heading}>
                        <ThemedText type="smallBold">{noteDateTitle(note.note_date, today)}</ThemedText>
                        {spokenLabel(note.spoken_seconds) ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {spokenLabel(note.spoken_seconds)}
                          </ThemedText>
                        ) : null}
                      </View>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {notePreview(note.body, 140)}
                      </ThemedText>
                    </Touchable>
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

const styles = StyleSheet.create({
  month: { gap: Spacing.two, marginBottom: Spacing.four },
  row: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.half, minHeight: 64 },
  // The date and the duration on one line, pushed apart — so a column of rows reads as a column of
  // dates first, which is how anyone looks for a day they half-remember.
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
