import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Radius, Spacing } from '@/constants/theme';

/**
 * A loading screen's job is to hold the shape that is about to arrive, so the page doesn't jump
 * when it does. That makes these two shapes different objects, not one shared block: Progress is a
 * tall orbit over a chart, Insights is a ring over three smaller cards. They were one component,
 * and the shared block went on describing a card layout that had been replaced.
 */

/** Progress: the lunar-orbit hero, then the Over-time chart (header + control + readout + plot). */
export function ProgressSkeleton() {
  return (
    <View style={styles.root}>
      <Skeleton height={410} radius={Radius.card} />
      <Skeleton height={304} radius={Radius.card} />
    </View>
  );
}

/** Habits → Insights: the consistency ring, the streak pair, the weekday bars, the trend line. */
export function InsightsSkeleton() {
  return (
    <View style={styles.root}>
      <Skeleton height={300} radius={Radius.card} />
      <Skeleton height={112} radius={Radius.card} />
      <Skeleton height={200} radius={Radius.card} />
      <Skeleton height={224} radius={Radius.card} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
});
