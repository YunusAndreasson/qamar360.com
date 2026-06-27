import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Radius, Spacing } from '@/constants/theme';

/** Today's loading shape: the week strip, then a few habit rows. Mirrors the real
 *  layout so content swaps in without the screen jumping. */
export function HabitsSkeleton() {
  return (
    <View style={styles.root}>
      <Skeleton height={88} radius={Radius.card} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} height={64} radius={Radius.card} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
});
