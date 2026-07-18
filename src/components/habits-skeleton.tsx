import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Radius, Spacing } from '@/constants/theme';

/** Today's loading shape: a column of habit-row cards. Mirrors the real list (the date lives in the
 *  header, so there's no hero block above the rows) — content swaps in without the screen jumping. */
export function HabitsSkeleton() {
  return (
    <View style={styles.root}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} height={64} radius={Radius.card} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // paddingTop mirrors the loaded list's zone break above its first card (gridBreath), so
  // the swap from skeleton to content doesn't jump the column.
  root: { gap: Spacing.two, paddingTop: Spacing.three },
});
