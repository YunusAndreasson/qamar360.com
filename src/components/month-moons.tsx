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

import { ProgressCell } from '@/components/progress-cell';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { Duration } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { MonthDay, MonthProgress } from '@/hooks/use-progress';
import { moonIllumination } from '@/lib/moon';
import { toDegrees } from '@/lib/progress';

const MOON_SIZE = 42;
/** Per-cell entrance offset → a gentle wax across the grid as it appears. */
const STAGGER_MS = 14;

/**
 * "This month": every day of the current Hijri month as a moon in a completion ring, laid out
 * six to a row like a contribution grid. Each moon shows that day's *true* lunar phase, so the
 * grid waxes to full around the 15th (laylat al-badr) and wanes back; the ring around it fills
 * with that day's completion. Today is emphasized, days still to come are faint. Hidden without
 * the Hijri calendar.
 */
export function MonthMoons({ month }: { month: MonthProgress | null }) {
  if (!month) return null;

  const a11y = `This month: ${toDegrees(month.thisRate)} degrees complete, day ${month.dayOfMonth} of ${
    month.monthLength
  }. Days 13 to 15 are the White Days, the Sunnah mid-month fasts.`;

  return (
    <StatCard accessible accessibilityLabel={a11y}>
      <StatCardHeader title="This month" trailing={month.monthName} />

      <View style={styles.grid}>
        {month.days.map((d, i) => (
          <MoonDay key={d.day} day={d} index={i} monthLength={month.monthLength} />
        ))}
      </View>
    </StatCard>
  );
}

function MoonDay({ day: d, index, monthLength }: { day: MonthDay; index: number; monthLength: number }) {
  const reduceMotion = useReducedMotion();
  const { illumination, waxing } = moonIllumination(d.day, monthLength);

  // Each cell fades and lifts in, offset by its position so the grid reads as a soft wax across
  // the month on appear. Reduce Motion shows it already settled.
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      enter.set(1);
      return;
    }
    enter.set(withDelay(index * STAGGER_MS, withTiming(1, { duration: Duration.slow, easing: Easing.out(Easing.cubic) })));
  }, [reduceMotion, enter, index]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.get(),
    transform: [{ scale: 0.9 + enter.get() * 0.1 }],
  }));

  return (
    <Animated.View style={[styles.cell, enterStyle]}>
      <ProgressCell
        label={d.day}
        fraction={d.fraction}
        phase={{ illumination, waxing }}
        active={d.state === 'today'}
        muted={d.state === 'future'}
        // The White Days (13th–15th): the moon is full and the Sunnah fast falls here.
        whiteDay={d.day >= 13 && d.day <= 15}
        size={MOON_SIZE}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three },
  cell: { width: '16.666%' },
});
