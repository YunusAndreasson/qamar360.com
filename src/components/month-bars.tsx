import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { DenseLabelScale, Spacing } from '@/constants/theme';
import type { MonthDay, MonthProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { toDegrees } from '@/lib/progress';

const CHART_HEIGHT = 72;
const BAR_WIDTH = 5;
/** A small visible nub so "a little done" never reads the same as "nothing done". */
const MIN_FILL = 3;
/** Per-bar entrance offset → a quick left-to-right sweep as the chart appears. */
const STAGGER_MS = 12;

/**
 * "This month": every day of the current Hijri month as a bar — day 1 (left) to the last.
 * Each fills with that day's completion over a faint full-day track; today's slot is
 * brighter, days still to come are faint empty tracks. Hidden without the Hijri calendar.
 */
export function MonthBars({ month }: { month: MonthProgress | null }) {
  if (!month) return null;

  const rate = month.thisPossible > 0 ? month.thisDone / month.thisPossible : 0;
  const a11y = `This month: ${toDegrees(rate)} degrees complete, day ${month.dayOfMonth} of ${month.monthLength}.`;

  return (
    <StatCard style={styles.card} accessible accessibilityLabel={a11y}>
      <StatCardHeader title="This month" trailing={month.monthName} />

      <View style={styles.row}>
        {month.days.map((d, i) => (
          <DayColumn key={d.day} day={d} index={i} monthLength={month.monthLength} />
        ))}
      </View>
    </StatCard>
  );
}

function DayColumn({ day: d, index, monthLength }: { day: MonthDay; index: number; monthLength: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const fill = d.fraction > 0 ? Math.max(MIN_FILL, Math.round(d.fraction * CHART_HEIGHT)) : 0;
  const fillColor = d.fraction >= 1 ? theme.complete : theme.accent;
  // Past days sit on the faint track; today's slot is brighter ("you are here");
  // days still to come are ghostlier.
  const trackColor =
    d.state === 'future' ? theme.accentTrackMuted : d.state === 'today' ? theme.accentTrackStrong : theme.accentTrack;

  // Each bar grows up to its value on appear, offset by its column so the row reads
  // as a quick left-to-right sweep. Reduce Motion shows it already filled.
  const grow = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      grow.value = 1;
      return;
    }
    grow.value = withDelay(index * STAGGER_MS, withTiming(1, { duration: Duration.slow, easing: Easing.out(Easing.cubic) }));
  }, [reduceMotion, grow, index]);
  const fillStyle = useAnimatedStyle(() => ({ height: fill * grow.value }));

  const label = d.day === 1 || d.day === monthLength || d.day % 5 === 0 ? d.day : '';

  return (
    <View style={styles.column}>
      <View style={styles.track}>
        <View style={[styles.fill, styles.full, { backgroundColor: trackColor }]} />
        {fill > 0 ? <Animated.View style={[styles.fill, fillStyle, { backgroundColor: fillColor }]} /> : null}
      </View>
      {/* A sparse day axis — 1, every 5th, and the last day (29 or 30). Fixed width +
          no-wrap so 2-digit days overflow into the empty neighbours instead of stacking. */}
      <ThemedText
        type={d.state === 'today' ? 'smallCompactBold' : 'smallCompact'}
        numberOfLines={1}
        maxFontSizeMultiplier={DenseLabelScale}
        style={[styles.label, { color: d.state === 'today' ? theme.accent : theme.textSecondary }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', gap: Spacing.one },
  track: { width: BAR_WIDTH, height: CHART_HEIGHT, borderRadius: BAR_WIDTH / 2, overflow: 'hidden' },
  fill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: BAR_WIDTH / 2 },
  full: { top: 0 },
  label: { width: 24, textAlign: 'center' },
});
