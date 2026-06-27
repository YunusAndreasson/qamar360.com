import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Polygon } from 'react-native-svg';

import { MoonPhase } from '@/components/moon-phase';
import { MoonHalo } from '@/components/ornament/moon-halo';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { MonthProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { moonIllumination } from '@/lib/moon';
import { clamp01, toDegrees } from '@/lib/progress';

const ORBIT_SIZE = 232;
const MOON_SIZE = 154;
// The halo radiates past the orbit into the card; sized to stay within the card's width.
const HALO_SIZE = 330;
const RING_STROKE = 12;
const RING_RADIUS = (ORBIT_SIZE - RING_STROKE) / 2;
// The Q's tail — last month's pace marker — sits just outside the rim (like the tail on
// the app's "Q"), so the canvas is a touch larger than the ring footprint to give that
// protrusion room. The ring stays centred over the moon (its footprint is unchanged);
// only the drawing surface grows.
const TAIL_OUT = 16;
const SVG_SIZE = ORBIT_SIZE + TAIL_OUT * 2;
const RING_CENTER = SVG_SIZE / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Month-to-date progress wrapped around the real moon for today's Hijri date. */
export function MonthSummary({ month }: { month: MonthProgress | null }) {
  const theme = useTheme();
  if (!month) return null;

  const { monthName, year, dayOfMonth, monthLength } = month;
  const thisRate = month.thisPossible > 0 ? month.thisDone / month.thisPossible : 0;
  const previousRate = month.previousPossible > 0 ? month.previousDone / month.previousPossible : 0;
  const hasPrevious = month.previousPossible > 0;
  const thisDegrees = toDegrees(thisRate);
  // Last month's pace by this same day, on the *same* absolute orbit scale as the headline —
  // so the two read as comparable positions (188° vs 360°), and last month's number is exactly
  // where its marker sits. No signed delta to be misread as a position.
  const previousDegrees = toDegrees(previousRate);
  const { illumination, waxing } = moonIllumination(dayOfMonth, monthLength);
  const a11y = hasPrevious
    ? `${monthName} ${year}, day ${dayOfMonth} of ${monthLength}. This month is at ${thisDegrees} degrees of the orbit; ${
        month.previousMonthName || 'last month'
      } had reached ${previousDegrees} degrees by the same day.`
    : `${monthName} ${year}, day ${dayOfMonth} of ${monthLength}. This month is ${thisDegrees} degrees complete.`;

  return (
    <StatCard style={styles.card} patternVariant="hero" accessible accessibilityLabel={a11y}>
      <StatCardHeader title={`${monthName} ${year}`} trailing={`Day ${dayOfMonth} of ${monthLength}`} />

      <View style={styles.hero}>
        <View style={styles.orbit}>
          <MoonHalo size={HALO_SIZE} />
          <ProgressOrbit current={thisRate} previous={hasPrevious ? previousRate : 0} />
          <View style={styles.moon}>
            <MoonPhase illumination={illumination} waxing={waxing} size={MOON_SIZE} />
          </View>
        </View>

        <View style={styles.metrics}>
          <ThemedText type="subtitleBold">
            {thisDegrees}°
          </ThemedText>
          <View style={styles.pace}>
            {hasPrevious ? (
              <>
                {/* The same tick that marks last month's pace on the orbit — a tiny legend
                    so the line on the ring reads unmistakably as "last month". Only shown
                    when the ring actually has a tick (last month had some pace by this day),
                    so the legend never references a mark that isn't there. */}
                {previousRate > 0 ? (
                  <View style={[styles.legendTick, { borderTopColor: theme.textSecondary }]} />
                ) : null}
                <ThemedText type="small" themeColor="textSecondary">
                  last month
                </ThemedText>
                <ThemedText type="defaultBold" themeColor="textSecondary">
                  {previousDegrees}°
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Your first month
              </ThemedText>
            )}
          </View>
        </View>
      </View>
    </StatCard>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ProgressOrbit({ current, previous }: { current: number; previous: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const currentRate = clamp01(current);
  const previousRate = clamp01(previous);
  const currentColor = currentRate >= 1 ? theme.complete : theme.accent;

  // The orbit sweeps from empty to the month's completion on appear (and re-animates
  // when the rate changes) — the screen's signature motion. Reduce Motion lands it
  // on the final value with no sweep.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduceMotion
      ? currentRate
      : withTiming(currentRate, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) });
  }, [currentRate, reduceMotion, progress]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value),
  }));

  // Last month's pace at this same day is shown as a faint "ghost" arc of its fill, and the
  // bright live arc is measured against it: the stretch where the ghost shows past the bright
  // arc IS the "vs last month" deficit (and vice-versa when ahead). A full orbit (≈100% last
  // month) therefore reads as a full faint ring you're filling toward — no 0°/360° ambiguity.
  const previousArc = RING_CIRCUMFERENCE * previousRate;
  // A small caret marks the head of that ghost arc — it sits just outside the rim and points
  // inward at last month's exact spot (clockwise from 12 o'clock), reading unmistakably as
  // "last month reached here" rather than as an ambiguous tick.
  const markerAngle = previousRate * 2 * Math.PI;
  const markerX = Math.sin(markerAngle);
  const markerY = -Math.cos(markerAngle);
  const tanX = -markerY; // unit tangent, perpendicular to the radius
  const tanY = markerX;
  const rimR = RING_RADIUS + RING_STROKE / 2;
  const tipR = rimR + 1; // tip kisses the outer rim, pointing in at the spot
  const baseR = rimR + 11; // body sits just outside the rim
  const halfBase = 5;
  const markerTip = `${RING_CENTER + tipR * markerX},${RING_CENTER + tipR * markerY}`;
  const baseCx = RING_CENTER + baseR * markerX;
  const baseCy = RING_CENTER + baseR * markerY;
  const markerBaseA = `${baseCx + halfBase * tanX},${baseCy + halfBase * tanY}`;
  const markerBaseB = `${baseCx - halfBase * tanX},${baseCy - halfBase * tanY}`;

  return (
    <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} style={styles.ring}>
      <Circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke={theme.accentTrack}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      {/* Last month's fill — the faint benchmark the bright arc is measured against. */}
      {previousArc > 0 ? (
        <Circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          stroke={theme.accentTrackStrong}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${previousArc} ${RING_CIRCUMFERENCE}`}
          fill="none"
          transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
        />
      ) : null}
      <AnimatedCircle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke={currentColor}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        animatedProps={arcProps}
        fill="none"
        transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
      />
      {previousRate > 0 ? (
        <Polygon points={`${markerTip} ${markerBaseA} ${markerBaseB}`} fill={theme.textSecondary} />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.four },
  hero: { alignItems: 'center', gap: Spacing.three },
  orbit: {
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', top: -TAIL_OUT, left: -TAIL_OUT },
  moon: { alignItems: 'center', justifyContent: 'center' },
  metrics: { alignItems: 'center', gap: Spacing.one },
  pace: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // A small downward caret echoing the orbit's "last month" marker.
  legendTick: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
