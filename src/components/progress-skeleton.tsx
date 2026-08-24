import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Spacing } from '@/constants/theme';

/**
 * A loading screen's job is to hold the shape that is about to arrive, so the page doesn't jump
 * when it does. That makes these two shapes different objects, not one shared block: Progress is a
 * tall orbit over a chart, Insights is a ring over three smaller cards. They were one component,
 * and the shared block went on describing a card layout that had been replaced.
 */

/**
 * Progress: the lunar-orbit hero, then the Over-time chart (header + readout + period control +
 * plot). Sized for the settled state, where the record is long enough to offer a choice of period —
 * a first-week account has no control yet and its chart lands ~64pt shorter, which is a jump nobody
 * sees twice.
 */
export function ProgressSkeleton() {
  return (
    <View style={styles.root}>
      <Skeleton height={392} />
      <Skeleton height={368} />
    </View>
  );
}

/** Habits → Insights: the consistency ring, the streak pair, the weekday bars, the trend line. */
export function InsightsSkeleton() {
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
