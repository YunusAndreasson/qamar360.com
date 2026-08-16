import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Radius, Spacing } from '@/constants/theme';

/**
 * The Journal's loading shape: a month caption over a card of entries, twice.
 *
 * Written out rather than left as three loose blocks because the archive does not arrive as three
 * loose blocks — it arrives as a `SectionLabel` over a `Surface` at `Radius.card`, in month groups
 * with a wide break between them. A placeholder that misses the caption, the corner radius and the
 * grouping is a placeholder the page has to rearrange itself around, which is the one thing a
 * skeleton exists to prevent.
 *
 * Two groups of different lengths, not two of the same: the archive is a record of however much
 * anyone wrote, and a pair of identical blocks reads as a template rather than as a list.
 */
const GROUPS = [3, 2];

/**
 * An archive row at its ordinary height — not its `minHeight`, which nothing but a one-line entry
 * ever reaches. 8 + 8 of vertical padding, a 20pt heading line, a 2pt gap, and two 20pt lines of
 * preview.
 */
const ROW_HEIGHT = 16 + 20 + 2 + 40;

/** About the width of "SEPTEMBER" in the caption tier. */
const CAPTION_WIDTH = 104;
const CAPTION_HEIGHT = 14;

export function JournalSkeleton() {
  return (
    <>
      {GROUPS.map((rows, i) => (
        <View key={i} style={styles.month}>
          {/* Inset to match `SectionLabel`, which carries its own 16pt left margin. */}
          <View style={styles.caption}>
            <Skeleton height={CAPTION_HEIGHT} />
          </View>
          <Skeleton height={ROW_HEIGHT * rows} radius={Radius.card} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // The loaded screen's own month rhythm (`journal.tsx`): 8 between a caption and its card, and a
  // wide break to the next month.
  month: { gap: Spacing.two, marginBottom: Spacing.four },
  caption: { width: CAPTION_WIDTH, marginLeft: Spacing.three },
});
