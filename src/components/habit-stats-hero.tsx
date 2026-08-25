import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { TallyDegrees } from '@/components/tally-degrees';
import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { TrendPoint } from '@/hooks/use-habit-stats';
import { useTheme } from '@/hooks/use-theme';
import { clamp01, toDegrees } from '@/lib/progress';

const RING_SIZE = 176;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_CENTER = RING_SIZE / 2;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * "Am I improving?" for a single habit, judged only on the last month vs the month before it —
 * so a genuine recent rise reads as "Rising" and everything else stays silent (the app's
 * trend voice: celebrate a real ascent, never scold a dip). Needs both endpoints to carry
 * data, so a brand-new habit says nothing rather than a hollow "Rising".
 */
function trendDescriptor(trend: TrendPoint[]): string | null {
  const last = trend[trend.length - 1];
  const monthAgo = trend[trend.length - 5]; // four weekly samples back ≈ a month
  if (!last || !monthAgo) return null;
  // An endpoint with no scheduled days carries no signal — for a habit younger than a month,
  // "monthAgo" predates its creation and its 0 rate would make any current rate read "Rising".
  if (last.scheduledCount === 0 || monthAgo.scheduledCount === 0) return null;
  return last.rate > monthAgo.rate + 0.08 ? 'Rising' : null;
}

/**
 * The headline: a completion ring filled to the habit's consistency, echoing the row's own moon
 * ring at hero scale, with the degrees figure centred inside it. Deliberately NOT the Progress
 * moon-phase disc — that reads the calendar day, which says nothing about one habit. Two-
 * temperature like the orbit: cool steel while below a full month's worth, warm `complete`
 * moonlight the instant it reaches a perfect 360°.
 */
export function HabitStatsHero({
  consistency,
  trend,
  scheduledDays,
}: {
  consistency: number;
  trend: TrendPoint[];
  scheduledDays: number;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const rate = clamp01(consistency);
  const degrees = toDegrees(rate);
  const arcColor = rate >= 1 ? theme.complete : theme.accent;
  const descriptor = trendDescriptor(trend);

  // Sweep from empty to the consistency on appear — the screen's signature motion, shared with
  // the Progress orbit. Reduce Motion lands on the final value with no sweep.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      reduceMotion ? rate : withTiming(rate, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) }),
    );
  }, [rate, reduceMotion, progress]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.get()) }));

  const caption =
    scheduledDays > 0
      ? `${descriptor ? `${descriptor} · ` : ''}${scheduledDays} scheduled ${scheduledDays === 1 ? 'day' : 'days'}`
      : 'No scheduled days yet';
  const a11y = `Consistency ${degrees} degrees, over ${scheduledDays} scheduled ${scheduledDays === 1 ? 'day' : 'days'}.${descriptor ? ' Rising.' : ''}`;

  return (
    <StatCard accessible accessibilityLabel={a11y}>
      <StatCardHeader title="Consistency" />
      <View style={styles.hero}>
        <View style={styles.ringBox}>
          <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            <Circle
              cx={RING_CENTER}
              cy={RING_CENTER}
              r={RING_RADIUS}
              stroke={theme.accentTrack}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {/* Butt-capped at exactly zero, round once there is an arc to cap. **A round cap on a
                ZERO-length dash is still drawn** — SVG renders it as a full dot — so a habit you
                have never kept put a bright 12pt accent mark at the top of the ring, directly above
                a reading of "0°", where it read as the first sliver of progress. The same defect,
                and the same fix, as the Progress orbit (`month-summary`) and the day's completion
                mark (`completion-ring`, which hides the stroke below 0.004 instead); this ring was
                the one place the guard had never been applied. The cap follows the TARGET rate, not
                the animated value, so a sweep that starts from zero still rounds off the whole way
                up. */}
            <AnimatedCircle
              cx={RING_CENTER}
              cy={RING_CENTER}
              r={RING_RADIUS}
              stroke={arcColor}
              strokeWidth={RING_STROKE}
              strokeLinecap={rate > 0 ? 'round' : 'butt'}
              strokeDasharray={RING_CIRCUMFERENCE}
              animatedProps={arcProps}
              fill="none"
              transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
            />
          </Svg>
          {/* The degrees figure sits centred in the ring's interior. */}
          <View style={styles.center} pointerEvents="none">
            <TallyDegrees degrees={degrees} />
          </View>
        </View>

        <ThemedText type="smallCompact" themeColor="textSecondary">
          {caption}
        </ThemedText>
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.three },
  ringBox: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
