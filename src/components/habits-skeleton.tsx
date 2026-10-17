import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Spacing } from '@/constants/theme';

/** Today's loading shape: a column of habit-row cards. Mirrors the real list (the date lives in the
 *  header, so there's no hero block above the rows) — content swaps in without the screen jumping. */
export function HabitsSkeleton() {
  return (
    <View style={styles.root}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} height={64} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 16 here and AppScreen's own 16 between children: the 32 the loaded day's first section keeps
  // under the week bar, so the column starts where the list will.
  root: { gap: Spacing.two, paddingTop: Spacing.three },
});
