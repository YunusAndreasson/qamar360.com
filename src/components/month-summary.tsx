import { useRouter } from 'expo-router';
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

import { AppIcon } from '@/components/app-icon';
import { MoonPhase } from '@/components/moon-phase';
import { HeroGlow } from '@/components/ornament/hero-glow';
import { MoonHalo } from '@/components/ornament/moon-halo';
import { PressableScale } from '@/components/pressable-scale';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { TallyDegrees } from '@/components/tally-degrees';
import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import { useOnStage } from '@/hooks/use-on-stage';
import type { MonthProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { moonIllumination } from '@/lib/moon';
import { clamp01, toDegrees } from '@/lib/progress';

// Exported for the reading sheet's legend, which redraws these marks at glyph scale. The legend
// quotes the instrument rather than approximating it — the last time a legend carried its own
// numbers they drifted (an 8×7 CSS triangle against the ring's 10×10).
export const ORBIT_SIZE = 232;
export const RING_STROKE = 12;
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
export const TICK_LENGTH = 10;
export const TICK_HALF_BASE = 5;

/** Month-to-date progress wrapped around the real moon for today's Hijri date. */
export function MonthSummary({ month }: { month: MonthProgress | null }) {
  // Tonight's moon breathes — a very slow, shallow luminance dip, like the calm of dhikr, so the
  // "you are here" moon reads as alive rather than merely lit. Reduce Motion holds it at full.
  //
  // So does being off stage. This is one of the app's two never-ending animations, and the Progress
  // tab is mounted from launch whether or not it has ever been opened — so without the gate the
  // moon breathes, and holds the display link open at the device's full refresh rate, behind a tab
  // the user may never visit. It resumes from rest on arrival, which is where the cycle starts.
  const theme = useTheme();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const onStage = useOnStage();
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.set(reduceMotion || !onStage
      ? 0
      : withRepeat(withTiming(1, { duration: Duration.breath, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduceMotion, onStage, breath]);
  const moonBreath = useAnimatedStyle(() => ({ opacity: 1 - breath.get() * 0.07 }));

  if (!month) return null;

  const { monthName, year, dayOfMonth, monthLength, thisRate, paceRate, previousRate, hasPrevious } = month;
  const thisDegrees = toDegrees(thisRate);
  // Where the month itself stands — what it has asked of you so far, on the same orbit scale. The
  // one benchmark that exists on a first day, so the ring always has a mark to catch.
  const paceDegrees = toDegrees(paceRate);
  // Last month's pace by this same day, on the *same* absolute orbit scale as the headline —
  // so the two read as comparable positions (188° vs 360°), and last month's number is exactly
  // where its marker sits. No signed delta to be misread as a position.
  const previousDegrees = toDegrees(previousRate);
  const { illumination, waxing } = moonIllumination(dayOfMonth, monthLength);
  const a11y = [
    `${monthName} ${year}, day ${dayOfMonth} of ${monthLength}.`,
    `This month is at ${thisDegrees} degrees of the orbit; the month itself has reached ${paceDegrees} degrees.`,
    hasPrevious ? `${month.previousMonthName} had reached ${previousDegrees} degrees by the same day.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  // The sheet reads a snapshot of what was tapped, passed along rather than re-derived: mounting
  // the progress hook a second time would fire a fetch to re-answer a question already on screen,
  // and a detail view that disagrees with the card it opened from is worse than a stale one.
  const openReading = () =>
    router.push({
      pathname: '/(tabs)/progress/orbit',
      params: {
        monthName,
        year: String(year),
        current: String(thisDegrees),
        pace: String(paceDegrees),
        previous: hasPrevious ? String(previousDegrees) : '',
        previousMonthName: month.previousMonthName,
      },
    });

  return (
    <StatCard pattern>
      <StatCardHeader title={`${monthName} ${year} H`} trailing={`Day ${dayOfMonth} of ${monthLength}`} />

      {/* The whole emblem is the target, not the ⓘ alone: a 232pt instrument with a 15pt hit area
          is a puzzle. The card itself is deliberately NOT `accessible` — flattening it would
          swallow this button and leave the reading unreachable. */}
      <PressableScale
        style={styles.hero}
        onPress={openReading}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Opens what each part of the orbit means">
        <View style={styles.orbit}>
          {/* The month is done: the moon lights up. A warm aura blooms behind it and past the
              orbit — the one moment the whole emblem glows. */}
          {thisRate >= 1 ? <HeroGlow size={GLOW_SIZE} /> : null}
          {/* The halo is ornament, and now says so. It used to fade in with the month's rate
              (0.10 → 0.22 across a whole month), which is a data channel below the threshold
              anyone can perceive — a fourth way of encoding progress that nobody could read, on
              an emblem that already had three. Completion is carried by the arc, by the moon's
              brightness, and by the bloom; the geometry just sits behind them. */}
          <MoonHalo size={HALO_SIZE} />
          <ProgressOrbit current={thisRate} pace={paceRate} previous={hasPrevious ? previousRate : 0} />
          {/* The moon is the calendar, the orbit ring is the data — so the moon rests quiet (dimmer
              moonlight, still opaque) and lets the bright ring + the degrees readout lead,
              brightening to full only when the month is done (where the glow also lights). It
              breathes slowly — tonight's moon, alive. */}
          <Animated.View style={[styles.moon, moonBreath]}>
            <MoonPhase illumination={illumination} waxing={waxing} size={MOON_SIZE} brightness={thisRate >= 1 ? 1 : 0.8} />
          </Animated.View>
        </View>

        {/* One bold datum, and a way in to the rest. The two benchmark readings that used to sit
            here as glyph-and-number legends now live in the sheet this opens: they were the ring's
            only legend, and three quiet lines under a 232pt orbit read as a footnote to it rather
            than as the instrument's key. Demoting them to a detail view is only safe because the
            ring was simplified to match (see {@link ProgressOrbit}) — a legend is not optional for
            a diagram that needs one. */}
        <View style={styles.metrics}>
          <TallyDegrees degrees={thisDegrees} />
          <View style={styles.affordance}>
            <AppIcon name="info" size={15} color={theme.textSecondary} />
            <ThemedText type="smallCompact" themeColor="textSecondary">
              What am I looking at?
            </ThemedText>
          </View>
        </View>
      </PressableScale>
    </StatCard>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The month as three readings on one ring:
 *
 *   accentTrackMuted   the month still to come
 *   accentTrack        the month elapsed — what it has asked of you (always present)
 *   accent / complete  you
 *
 * plus a caret outside the rim at last month's position by this same day.
 *
 * **There were four bands, and the fourth had to go.** Last month used to be a third tonal step
 * (`accentTrackStrong`) between the other two, which made the ring three shades of one hue with
 * only their lightness to tell them apart — and those track tones are deliberately sub-3:1, being
 * informational rather than text. It worked while two legend rows sat under the orbit naming them.
 * They don't any more (the reading moved into a sheet), and an unlabelled band between two other
 * unlabelled bands is not a benchmark, it is a smudge. The caret survives that loss where a band
 * cannot, because it is distinguished by SHAPE: you can see it is a different kind of mark without
 * being told what it means, and then be told once.
 *
 * What remains is a progress bar with a target mark, which is a thing people already know how to
 * read. The elapsed stretch is still an ARC rather than a point, because a point on a ring is
 * ambiguous where 0° and 360° meet at the top; an arc *length* is not, and the stretch where the
 * dimmer band shows past the bright one IS the gap — read directly, with no arithmetic.
 */
function ProgressOrbit({ current, pace, previous }: { current: number; pace: number; previous: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const currentRate = clamp01(current);
  const paceRate = clamp01(pace);
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

  // The month's own reach, laid over the untouched remainder: the track brightens across the
  // stretch that has already come due. It costs no extra ink — the ring was always a full circle —
  // and it means the very first day has an arc to close on rather than a bare loop.
  const paceArc = RING_CIRCUMFERENCE * paceRate;
  // A small caret marks last month's position — it sits just outside the rim and points
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
      {/* The month still to come — the dimmest step, so the elapsed stretch above it reads as a
          brightening rather than as a separate object laid on top. */}
      <Circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke={theme.accentTrackMuted}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      {/* The month elapsed — the mark to catch, and the only one a first month has. Butt-capped,
          not round: a round cap would overhang its exact position by half the stroke, and this
          band's head is the thing the bright arc is measured against. */}
      {paceArc > 0 ? (
        <Circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          stroke={theme.accentTrack}
          strokeWidth={RING_STROKE}
          strokeDasharray={`${paceArc} ${RING_CIRCUMFERENCE}`}
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
  // One card gap across both Progress stat cards (this hero and OverTime) so their
  // header→content rhythm reads identically down the screen.
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
  affordance: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
