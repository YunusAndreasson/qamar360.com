import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import { ManageRow } from '@/components/manage-row';
import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { Skeleton } from '@/components/skeleton';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { RowLeadingSlot, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { noteRowContract, spokenLabel, type DailyNote } from '@/lib/notes';

/** How much of an entry Today shows before it asks you to open it. Six lines is about a paragraph —
 *  enough that yesterday can be *read* by stepping back to it, short enough that a long night
 *  doesn't take the whole screen. */
const PREVIEW_LINES = 6;

type Props = {
  note: DailyNote | null;
  /** This day's note isn't known yet. Not the same as "there isn't one" — see below. */
  loading: boolean;
  /** Space above the caption — the screen owns it, so the day's sections break on one rhythm. */
  topGap: number;
  /** Whether the viewed day is today, which changes what the empty row asks. */
  isToday: boolean;
  /** The day as the header names it ("Today", "Yesterday", "Thu, 7 Aug") — the row borrows it
   *  rather than re-deriving it, so the two can never disagree. */
  dayTitle: string;
  onOpen: () => void;
  onOpenJournal: () => void;
};

/**
 * NOTE — the day in the user's own words, at the foot of it.
 *
 * At the foot, and not the head, for the same reason the to-dos are at the head: order is an
 * argument about when. A to-do is the part of the day that expires, so it goes first. A note is the
 * reckoning, so it goes last — after the practice it is reckoning with, and out of the way on a
 * morning when there is nothing to say yet.
 *
 * Unlike every other section here, this one is **permanent chrome**, and deliberately so. TO DO can
 * render nothing because the day is never blank without it — the practice is already there. The
 * note has no such fallback: an invitation that only appears once you have already used the feature
 * is not an invitation. It is one quiet row, below everything, and it is the only signifier that
 * the day can be written about at all.
 *
 * It stays on a past day too, which is the one place this parts company with `TaskSection`. Writing
 * a to-do "for last Tuesday" is not a thing anyone means to do; writing *about* last Tuesday is the
 * ordinary case, because the honest hour for a reflection is usually after you have already fallen
 * asleep.
 */
export function NoteSection({ note, loading, topGap, isToday, dayTitle, onOpen, onOpenJournal }: Props) {
  const theme = useTheme();
  const row = noteRowContract({ body: note?.body ?? '', isToday, dayTitle });
  const spoken = spokenLabel(note?.spoken_seconds ?? null);

  return (
    <View style={[styles.section, { paddingTop: topGap }]}>
      <SectionLabel>NOTE</SectionLabel>
      <Surface>
        {/* An unknown day is not an empty one. Stepping back to a day you did write about would
            otherwise show the invitation first and replace it with the entry a beat later — the
            app appearing to forget, then remember. A placeholder says "not yet" honestly, and
            holds the row's height so nothing below it jumps when the answer arrives. */}
        {loading ? (
          <View style={[styles.row, styles.placeholder]}>
            <Skeleton height={16} />
          </View>
        ) : (
          <Touchable
            onPress={onOpen}
            androidRipple={{ color: theme.backgroundSelected }}
            underlayColor={theme.backgroundSelected}
            activeUnderlayOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            accessibilityHint={row.hint}
            style={styles.row}>
            {/* The same 32-wide column every leading mark on the day keeps, so the note's first
                line starts where the act titles above it do. The glyph is only there while the row
                is an invitation: once there are words, they are the content, and a microphone
                beside them would be labelling the past rather than offering the future. */}
            {row.mode === 'write' ? (
              <View style={styles.leading}>
                <AppIcon name="mic" size={20} color={theme.accent} />
              </View>
            ) : null}
            <View style={styles.body}>
              <ThemedText
                type={row.mode === 'write' ? 'rowTitle' : 'default'}
                numberOfLines={row.mode === 'write' ? 1 : PREVIEW_LINES}
                style={row.mode === 'write' ? { color: theme.textSecondary } : null}>
                {row.text}
              </ThemedText>
              {spoken ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {spoken}
                </ThemedText>
              ) : null}
            </View>
          </Touchable>
        )}
        <RowSeparator />
        {/* The quiet door out of the day and into the record. A chevron would say "more to read"
            about *this* card; a named row says what is actually behind it — and the archive is the
            only route past the stepper's thirty days. */}
        <ManageRow
          icon="journal"
          label="Past notes"
          accessibilityLabel="Past notes"
          accessibilityHint="Opens your journal, with everything you have written."
          onPress={onOpenJournal}
        />
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  // The same 16pt horizontal inset `DragGrid` gives the stack cards. This section sits outside the
  // drag layer — a note has no slot in the day's order — so it reproduces the alignment rather than
  // inheriting it, exactly as the tasks and exchanges sections do.
  section: { gap: Spacing.two, paddingHorizontal: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  leading: RowLeadingSlot,
  // The placeholder occupies the row's own geometry, minus the leading column it has nothing to
  // put in — so the card is the same height before and after the answer arrives.
  placeholder: { justifyContent: 'center' },
  // `marginLeft` on the text rather than a row `gap`, so an entry with no leading glyph runs the
  // full width of the card instead of being indented past a column that isn't there.
  body: { flex: 1, marginLeft: Spacing.three, gap: Spacing.half },
});
