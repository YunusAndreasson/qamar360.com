import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Radius, Spacing } from '@/constants/theme';

/** Progress's loading shape: the lunar-orbit hero, the month bars, the year row. */
export function ProgressSkeleton() {
  return (
    <View style={styles.root}>
      <Skeleton height={300} radius={Radius.card} />
      <Skeleton height={168} radius={Radius.card} />
      <Skeleton height={120} radius={Radius.card} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
});
