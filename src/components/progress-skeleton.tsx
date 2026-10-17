import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Spacing } from '@/constants/theme';

/**
 * A loading screen's job is to hold the shape that is about to arrive, so the page doesn't jump
 * when it does. That makes these two shapes different objects, not one shared block: Progress is a
 * tall orbit over a chart, Stats is a ring over three smaller cards. They were one component,
 * and the shared block went on describing a card layout that had been replaced.
 */

/**
 * Progress: the lunar-orbit hero, then the Year and Lifetime cards, which every account with a
 * habit gets. All three are the cards' real heights, which is what holds the page still when the
 * data lands. The hero is padding, header and gap, then the 232pt orbit and its halo inset
 * (16 + 24 + 16 + 232 + 16 + 16). A period card is the header over the 136pt plot
 * (16 + 24 + 16 + 136 + 16). Lifetime grows 28pt when it has a trend sentence, but it is the last
 * card, so nothing above it moves.
 */
export function ProgressSkeleton() {
  return (
    <View style={styles.root}>
      <Skeleton height={320} />
      <Skeleton height={208} />
      <Skeleton height={208} />
    </View>
  );
}

/** Habits → Stats: the consistency ring, the streak pair, the weekday bars, the trend line. */
export function StatsSkeleton() {
  return (
    <View style={styles.root}>
      <Skeleton height={300} />
      <Skeleton height={112} />
      <Skeleton height={200} />
      <Skeleton height={224} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
});
