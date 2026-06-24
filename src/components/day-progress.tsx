import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TRACK_HEIGHT = 8;

/**
 * "Day at a glance" above the habit list: a single bar that fills as the day's
 * habits are ticked — no counts, no percentage, because the bar (and the
 * checklist right below it) already say it. A crescent appears, wordlessly, the
 * moment the day is complete. Renders nothing on a day with nothing scheduled.
 */
function DayProgressBase({ done, total }: { done: number; total: number }) {
  const theme = useTheme();
  const fraction = total > 0 ? done / total : 0;
  const complete = total > 0 && done === total;

  const progress = useSharedValue(fraction);
  useEffect(() => {
    progress.value = withSpring(fraction, { damping: 18, stiffness: 180 });
  }, [fraction, progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (total === 0) return null;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done }}
      accessibilityLabel={`${done} of ${total} habits done`}>
      <View style={[styles.track, { backgroundColor: theme.accentSubtle }]}>
        <Animated.View style={[styles.fill, fillStyle, { backgroundColor: theme.accent }]} />
      </View>
      {complete ? (
        <ThemedText type="default" accessibilityElementsHidden importantForAccessibility="no">
          🌙
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  track: { flex: 1, height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: TRACK_HEIGHT / 2 },
});

// Memoized — only re-render when the day's done/total counts actually change.
export const DayProgress = memo(DayProgressBase);
