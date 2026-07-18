import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Polygon } from 'react-native-svg';

import { MoonPhase } from '@/components/moon-phase';
import { HeroGlow } from '@/components/ornament/hero-glow';
import { MoonHalo } from '@/components/ornament/moon-halo';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { MonthProgress } from '@/hooks/use-progress';
import { useTallyUp } from '@/hooks/use-tally-up';
import { useTheme } from '@/hooks/use-theme';
import { moonIllumination } from '@/lib/moon';
import { clamp01, toDegrees } from '@/lib/progress';

const ORBIT_SIZE = 232;
const RING_STROKE = 12;
// The moon fills the orbit's interior exactly as a day-grid cell fills its ring
// (ProgressCircle: disc = box − 3×stroke, leaving a stroke/2 gap to the ring), so the hero and
// the "This month" moons read as one object at two scales — not a snug disc beside a floating
// one. 232 − 3×12 = 196.
const MOON_SIZE = ORBIT_SIZE - RING_STROKE * 3;
// The halo radiates past the orbit into the card; sized to stay within the card's width.
const HALO_SIZE = 330;
// The completion bloom — a warm aura that blooms behind the moon and past the orbit when the
// whole month is done. Smaller than the halo so it stays an aura, not a wash.
const GLOW_SIZE = 300;
const RING_RADIUS = (ORBIT_SIZE - RING_STROKE) / 2;
// The Q's tail — last month's pace marker — sits just outside the rim (like the tail on
// the app's "Q"), so the canvas is a touch larger than the ring footprint to give that
// protrusion room. The ring stays centred over the moon (its footprint is unchanged);
// only the drawing surface grows.
const TAIL_OUT = 16;
const SVG_SIZE = ORBIT_SIZE + TAIL_OUT * 2;
const RING_CENTER = SVG_SIZE / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// The tail tick's shared geometry — the ring marker and the metrics-row legend glyph both draw
// from these numbers, so the two renderings of "last month reached here" can never drift apart
// (they had: the old CSS-triangle legend was 8×7 against the ring's 10×10).
const TICK_LENGTH = 10;
const TICK_HALF_BASE = 5;

/** Month-to-date progress wrapped around the real moon for today's Hijri date. */
export function MonthSummary({ month }: { month: MonthProgress | null }) {
  // Tonight's moon breathes — a very slow, shallow luminance dip, like the calm of dhikr, so the
  // "you are here" moon reads as alive rather than merely lit. Reduce Motion holds it at full.
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.set(reduceMotion
      ? 0
      : withRepeat(withTiming(1, { duration: Duration.breath, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduceMotion, breath]);
  const moonBreath = useAnimatedStyle(() => ({ opacity: 1 - breath.get() * 0.07 }));

  if (!month) return null;

  const { monthName, year, dayOfMonth, monthLength, thisRate, previousRate, hasPrevious } = month;
  const thisDegrees = toDegrees(thisRate);
  // Last month's pace by this same day, on the *same* absolute orbit scale as the headline —
  // so the two read as comparable positions (188° vs 360°), and last month's number is exactly
  // where its marker sits. No signed delta to be misread as a position.
  const previousDegrees = toDegrees(previousRate);
  const { illumination, waxing } = moonIllumination(dayOfMonth, monthLength);
  const a11y = hasPrevious
    ? `${monthName} ${year}, day ${dayOfMonth} of ${monthLength}. This month is at ${thisDegrees} degrees of the orbit; ${month.previousMonthName} had reached ${previousDegrees} degrees by the same day.`
    : `${monthName} ${year}, day ${dayOfMonth} of ${monthLength}. This month is ${thisDegrees} degrees complete.`;

  return (
    <StatCard pattern patternVariant="hero" accessible accessibilityLabel={a11y}>
      <StatCardHeader title={`${monthName} ${year} H`} trailing={`Day ${dayOfMonth} of ${monthLength}`} />

      <View style={styles.hero}>
        <View style={styles.orbit}>
          {/* The month is done: the moon lights up. A warm aura blooms behind it and past the
              orbit — the one moment the whole emblem glows. */}
          {thisRate >= 1 ? <HeroGlow size={GLOW_SIZE} /> : null}
          {/* The sacred geometry firms up as the month fills — faintest at the new month, clearest
              when complete: "the moon generates the order", clarified by your consistency. */}
          <MoonHalo size={HALO_SIZE} strokeOpacity={0.1 + 0.12 * thisRate} />
          <ProgressOrbit current={thisRate} previous={hasPrevious ? previousRate : 0} />
          {/* The moon is the calendar, the orbit ring is the data — so the moon rests quiet (dimmer
              moonlight, still opaque) and lets the bright ring + the degrees readout lead,
              brightening to full only when the month is done (where the glow also lights). It
              breathes slowly — tonight's moon, alive. */}
          <Animated.View style={[styles.moon, moonBreath]}>
            <MoonPhase illumination={illumination} waxing={waxing} size={MOON_SIZE} brightness={thisRate >= 1 ? 1 : 0.8} />
          </Animated.View>
        </View>

        <View style={styles.metrics}>
          <HeroDegrees degrees={thisDegrees} />
          <View style={styles.pace}>
            {hasPrevious ? (
              <>
                {/* The same tick that marks last month's pace on the orbit — a tiny legend
                    so the line on the ring reads unmistakably as "last month". Only shown
                    when the ring actually has a tick (last month had some pace by this day),
                    so the legend never references a mark that isn't there. */}
                {previousRate > 0 ? <LegendTick /> : null}
                {/* "This day last month", not "last month" — the number is last month's pace by
                    this same day, and the shorter label read as last month's final total. One
                    quiet smallCompact run (the screen-wide readout voice, middot-joined), so the
                    hero holds exactly one bold datum: the degrees above. */}
                <ThemedText type="smallCompact" themeColor="textSecondary">
                  This day last month · {previousDegrees}°
                </ThemedText>
              </>
            ) : (
              <ThemedText type="smallCompact" themeColor="textSecondary">
                Your first month
              </ThemedText>
            )}
          </View>
        </View>
      </View>
    </StatCard>
  );
}

/**
 * The hero readout, isolated so the tally's ~60fps re-renders touch only this text — the
 * orbit/moon SVG siblings stay still. Tallied over `Duration.orbit` with the sweep's own
 * easing, so the number and the arc land on the same frame: one instrument, not two animations.
 */
function HeroDegrees({ degrees }: { degrees: number }) {
  const shown = useTallyUp(degrees, Duration.orbit);
  return <ThemedText type="display">{shown}°</ThemedText>;
}

/** The orbit's "last month" tail tick as an inline legend glyph — drawn from the same
 *  `TICK_*` geometry as the ring marker, pointing down at the reading beside it. */
function LegendTick() {
  const theme = useTheme();
  return (
    <Svg width={TICK_HALF_BASE * 2} height={TICK_LENGTH} viewBox={`0 0 ${TICK_HALF_BASE * 2} ${TICK_LENGTH}`}>
      <Polygon points={`${TICK_HALF_BASE},${TICK_LENGTH} 0,0 ${TICK_HALF_BASE * 2},0`} fill={theme.textSecondary} />
    </Svg>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ProgressOrbit({ current, previous }: { current: number; previous: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const currentRate = clamp01(current);
  const previousRate = clamp01(previous);
  // The orbit carries the two-temperature signal: cool steel while the month is in progress, warm
  // `complete` moonlight the instant it's done — so a finished orbit reads warm, matching the moon.
  const currentColor = currentRate >= 1 ? theme.complete : theme.accent;

  // The orbit sweeps from empty to the month's completion on appear (and re-animates
  // when the rate changes) — the screen's signature motion. Reduce Motion lands it
  // on the final value with no sweep.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(reduceMotion
      ? currentRate
      : withTiming(currentRate, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) }));
  }, [currentRate, reduceMotion, progress]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.get()),
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
  const baseR = tipR + TICK_LENGTH; // body sits just outside the rim
  const markerTip = `${RING_CENTER + tipR * markerX},${RING_CENTER + tipR * markerY}`;
  const baseCx = RING_CENTER + baseR * markerX;
  const baseCy = RING_CENTER + baseR * markerY;
  const markerBaseA = `${baseCx + TICK_HALF_BASE * tanX},${baseCy + TICK_HALF_BASE * tanY}`;
  const markerBaseB = `${baseCx - TICK_HALF_BASE * tanX},${baseCy - TICK_HALF_BASE * tanY}`;

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
  // One card gap across all three Progress stat cards (this hero, MonthMoons, YearTrend) so
  // their header→content rhythm reads identically down the screen.
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
});
