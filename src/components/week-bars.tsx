import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { WeekDay } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { formatDayHeader, weekdayInitial } from '@/lib/dates';

const CHART_HEIGHT = 120;
const BAR_WIDTH = 12;
/** A small visible nub so "a little done" never reads the same as "nothing done". */
const MIN_FILL = 4;
/** Per-bar stagger so the week "rises" left-to-right on appear, oldest day first. */
const STAGGER_MS = 45;

/**
 * Seven-day completion bar chart (today rightmost). Each day is a faint 0.14
 * backdrop (a perfect day) with the bright bar filling it — one tone, like the
 * moon ring. The bar springs up from the baseline, staggered across the week, so
 * the chart feels alive.
 */
export function WeekBars({ days }: { days: WeekDay[] }) {
  return (
    <View style={styles.row}>
      {days.map((day, i) => (
        <Bar key={day.iso} day={day} index={i} />
      ))}
    </View>
  );
}

function Bar({ day, index }: { day: WeekDay; index: number }) {
  const theme = useTheme();
  const target = day.fraction > 0 ? Math.max(MIN_FILL, Math.round(day.fraction * CHART_HEIGHT)) : 0;

  // Grow from the baseline to the day's fill, delayed by the day's position so
  // the bars cascade in. Respects the OS "reduce motion" setting.
  const height = useSharedValue(0);
  useEffect(() => {
    height.value = withDelay(
      index * STAGGER_MS,
      withSpring(target, { damping: 16, stiffness: 160, reduceMotion: ReduceMotion.System }),
    );
  }, [target, index, height]);
  const fillStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <View
      style={styles.column}
      accessible
      accessibilityLabel={`${formatDayHeader(day.iso)}: ${day.completed} of ${day.possible} habits done`}>
      <View style={styles.track}>
        {/* Faint backdrop — a perfect day (the shared 0.14 "potential" tone). */}
        <View style={[styles.fill, styles.full, { backgroundColor: theme.accent, opacity: 0.14 }]} />
        {/* This day's completion, springing up from the baseline. */}
        <Animated.View style={[styles.fill, fillStyle, { backgroundColor: theme.accent }]} />
      </View>
      <ThemedText
        type="small"
        style={[styles.label, { color: theme.textSecondary }, day.isToday && styles.todayLabel]}>
        {weekdayInitial(day.iso)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  column: { flex: 1, alignItems: 'center', gap: Spacing.one },
  track: {
    width: BAR_WIDTH,
    height: CHART_HEIGHT,
    borderRadius: BAR_WIDTH / 2,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: BAR_WIDTH / 2 },
  full: { top: 0 },
  label: { textAlign: 'center' },
  todayLabel: { fontWeight: '700' },
});
