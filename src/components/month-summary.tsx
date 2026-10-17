import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useId, useState } from 'react';
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
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { MoonPhase } from '@/components/moon-phase';
import { HeroGlow } from '@/components/ornament/hero-glow';
import { MoonHalo } from '@/components/ornament/moon-halo';
import { PressableScale } from '@/components/pressable-scale';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { Duration, Scale } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useOnStage } from '@/hooks/use-on-stage';
import type { MonthProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { moonIllumination } from '@/lib/moon';
import { orbitArrival, readOrbitSeen, writeOrbitSeen, type OrbitArrival } from '@/lib/orbit-seen';
import { clamp01, daysLeftLabel, toDegrees } from '@/lib/progress';
import { formatDegrees } from '@/lib/progress-format';

// Exported for the reading sheet's legend, which redraws these marks at glyph scale. The legend
// quotes the instrument rather than approximating it — the last time a legend carried its own
// numbers they drifted (an 8×7 CSS triangle against the ring's 10×10).
export const ORBIT_SIZE = 232;
// The band is the reading, so it is given enough ink to be one. Raising it also shrinks the moon,
// because MOON_SIZE is derived from it below — which is the trade this card needed: at 12 the disc
// carried 3.6x the ink of the whole band while being, by the sheet's own admission, not your
// progress. At 16 that is 2.5x, and the gauge is legible without the moon leaving.
export const RING_STROKE = 16;
// The moon fills the orbit's interior exactly as a day-grid cell fills its ring
// (ProgressCircle: disc = box − 3×stroke, leaving a stroke/2 gap to the ring), so the hero and
// the "This month" moons read as one object at two scales — not a snug disc beside a floating
// one. 232 − 3×16 = 184. (It was 196 while the stroke was 12; the size is DERIVED, so raising
// RING_STROKE to give the band enough ink to read as a gauge is what shrank the disc.)
const MOON_SIZE = ORBIT_SIZE - RING_STROKE * 3;
// The halo radiates past the orbit into the card; sized to stay within the card's width.
const HALO_SIZE = 330;
// The completion bloom — a warm aura that blooms behind the moon and past the orbit when the
// whole month is done. Smaller than the halo so it stays an aura, not a wash.
const GLOW_SIZE = 300;
const RING_RADIUS = (ORBIT_SIZE - RING_STROKE) / 2;
// The light at the stripe's head: a soft bloom riding the leading cap, so the front of the stripe
// reads as the place the month has got to rather than simply where the ink stops.
const HEAD_GLOW_R = 20;
// The glint that goes round a closed orbit once: a short stretch of moonlight, as a share of it,
// carrying a bloom wider than the stroke. The bloom is what shows at night, where a closed stripe
// is already the moon's own cream and a brighter dash on it is all but invisible.
const GLINT_SHARE = 0.09;
const GLINT_BLOOM_R = 28;
// What is drawn past the rim is light: the head's, and the glint's bloom, which reaches furthest,
// GLINT_BLOOM_R from the stroke's centre line. So the canvas runs that far out plus a hair (an SVG
// clips to its bounds, which would shave the antialiasing off the light's edge).
const RIM_BLEED = GLINT_BLOOM_R - RING_STROKE / 2 + 2;
const SVG_SIZE = ORBIT_SIZE + RIM_BLEED * 2;
const RING_CENTER = SVG_SIZE / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * How this month is going against your usual — said in words, on the sheet the card opens.
 *
 * This replaced a caret outside the ring's rim. A mark at your average position made the reader do
 * the work: find the tick, find the arc head, judge which is further round a circle, and remember
 * which of three unlabelled things the tick was. It also cost a legend row in the sheet, because an
 * abstract mark needs a key. A sentence needs none — that is the whole trade.
 *
 * `null` in a first month: there is no usual yet, and inventing one from nothing is the failure
 * mode this benchmark exists to avoid.
 *
 * Three-valued, with a dead band, because two positions closer than half a day of the month are
 * the same position — and calling one of them "behind" would be a scold invented by rounding. (It
 * would fire constantly: on any morning before the day's first tick, this month and your usual are
 * both near zero.) The band is half a day rather than a fixed figure so it means the same thing in
 * a 29-day month as in a 30-day one.
 */
function usualLabel(month: MonthProgress): string | null {
  if (month.monthsAveraged === 0) return null;
  // Compared in DEGREES, the unit the sheet shows, so the sentence can never disagree with the
  // figure beside it about which side of your usual you are on.
  const gap = toDegrees(month.thisRate) - toDegrees(month.averageRate);
  if (Math.abs(gap) <= 180 / month.monthLength) return 'About your usual';
  return gap > 0 ? 'Ahead of your usual' : 'Behind your usual';
}

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
  const { user } = useAuth();
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

  const { monthName, year, dayOfMonth, monthLength, thisRate, averageRate, monthsAveraged } = month;
  // The verdict and how much month is left to act on it. Neither is on the card any more: the card
  // is the instrument, and these are readings OF it, so they wait on the sheet a tap opens, beside
  // the figures they are read from.
  const usual = usualLabel(month);
  const daysLeft = daysLeftLabel(month);
  const { illumination, waxing } = moonIllumination(dayOfMonth, monthLength);
  const a11y = [
    `${monthName} ${year}, day ${dayOfMonth} of ${monthLength}.`,
    `This month is at ${formatDegrees(thisRate)} of the orbit.`,
    // The figure and the count are said here and nowhere on screen. The sheet gives the verdict,
    // which is what was asked for; this gives the measurement behind it, for anyone who wants to
    // know what "usual" was counted from.
    monthsAveraged > 0
      ? `Usually ${formatDegrees(averageRate)} by this day, averaged over ${monthsAveraged} previous ${monthsAveraged === 1 ? 'month' : 'months'}.`
      : '',
    usual,
    daysLeft,
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
        currentRate: String(thisRate),
        usual: usual ?? '',
        daysLeft,
      },
    });

  return (
    <StatCard pattern>
      {/* "This month" — a title, the way the card below is titled "Over time". The two are the
          screen's two scopes and now say so in the same voice; the hero used to lead with the date
          instead, so one card was headed by a category and the other by a datum, and only one of
          them told you what it was for. The month's NAME is the caption, which is where the app
          says which Hijri month you are in — this header is the only place at rest that does. The
          name alone: the year is the same all year, and the sheet still says it.

          The ⓘ sits in the card's own top-right corner, which is where a card keeps a button about
          itself in every app anyone already uses. It replaces a line of prose — "What am I looking
          at?" — that sat under the datum and said, in twenty-one characters, exactly what this one
          glyph says. The sentence is not lost: it is the button's accessible NAME, so the words
          still reach a screen reader and only leave the screen. */}
      <StatCardHeader
        title="This month"
        trailing={monthName}
        accessory={
          <PressableScale
            onPress={openReading}
            scaleTo={Scale.glyph}
            // 18pt of glyph + 16 each side clears Android's 48dp minimum without the button
            // taking any more of the header row than the ⓘ itself occupies.
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="What am I looking at?"
            accessibilityHint="Opens what each part of the orbit means">
            <AppIcon name="info" size={18} color={theme.textSecondary} />
          </PressableScale>
        }
      />

      {/* The whole emblem stays the target, not the ⓘ alone: a 232pt instrument with an 18pt hit
          area is a puzzle. The glyph is the *signifier* — it says a reading exists; the emblem is
          the affordance, and it is the size of the thing it explains. The card itself is
          deliberately NOT `accessible` — flattening it would swallow both and leave the reading
          unreachable. */}
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
          <MoonHalo size={HALO_SIZE} rings={false} />
          <ProgressOrbit current={thisRate} seenKey={`${user?.id ?? ''}|${year}|${monthName}`} onStage={onStage} />
          {/* The moon is the calendar, the orbit ring is the data — so the moon rests quiet (dimmer
              moonlight, still opaque) and lets the bright ring lead,
              brightening to full only when the month is done (where the glow also lights). It
              breathes slowly — tonight's moon, alive. */}
          <Animated.View style={[styles.moon, moonBreath]}>
            <MoonPhase illumination={illumination} waxing={waxing} size={MOON_SIZE} brightness={thisRate >= 1 ? 1 : 0.8} />
          </Animated.View>
        </View>
      </PressableScale>
    </StatCard>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The month as one stripe: a groove that is the whole 360°, and your stripe filling it.
 *
 * The stripe is counted from the day each act was added (see `MonthProgress.thisRate`), so a month
 * begun partway through can still close the full orbit. It starts at the top and runs clockwise,
 * like a clock hand, with a soft light at its head, and turns warm the moment it closes; the first
 * time a closed orbit is seen, a glint of moonlight goes round it once.
 *
 * **There were four bands, then three, and now one.** Last month went first, then a caret at your
 * usual (a comparison, which reads better as the sheet's sentence than as two positions on a
 * circle). The last to go was a brighter band for the month elapsed, laid over the groove as a mark
 * to catch. It made the ring two stripes to anyone not told which was theirs, so the ring is now
 * yours alone, and the elapsed month is left to the moon's phase and the days-left line.
 */
function ProgressOrbit({ current, seenKey, onStage }: { current: number; seenKey: string; onStage: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const uid = useId();
  const headGlowId = `orbit-head-${uid}`;
  const glintBloomId = `orbit-glint-${uid}`;
  const currentRate = clamp01(current);
  // The orbit carries the two-temperature signal: cool steel while the month is in progress, warm
  // `complete` moonlight the instant it's done — so a finished orbit reads warm, matching the moon.
  const currentColor = currentRate >= 1 ? theme.complete : theme.accent;

  // The stripe moves when it is LOOKED AT, from where it was last seen (see lib/orbit-seen). The
  // tab is mounted from launch, so a sweep keyed to the data alone played off screen and was all
  // but never seen; and the thing worth watching is not the entrance but what the acts since did.
  //
  // It starts where it was last seen, so arriving on a stripe that has not moved shows it standing
  // there, rather than empty for the frame before the effect below could place it.
  const [lastSeen] = useState(() => readOrbitSeen(seenKey) ?? 0);
  const progress = useSharedValue(lastSeen);
  // 0 → 1 once round the ring when the orbit closes; invisible at both ends, so it never resets.
  const glint = useSharedValue(1);

  // The landing, felt and (on a close) seen. An Effect Event, because it reads the latest Reduce
  // Motion setting but must not be a reason for the arrival to replay.
  const landed = useEffectEvent((arrival: OrbitArrival) => {
    if (arrival.closes) {
      haptics.orbitClosed();
      if (!reduceMotion) {
        glint.set(0);
        glint.set(withTiming(1, { duration: Duration.orbit, easing: Easing.inOut(Easing.cubic) }));
      }
    } else if (arrival.grew) {
      haptics.orbitLanded();
    }
  });

  useEffect(() => {
    if (!onStage) return; // off stage the stripe waits where it was, for you to see it move
    const arrival = orbitArrival(readOrbitSeen(seenKey), currentRate);
    writeOrbitSeen(seenKey, currentRate);
    if (!arrival) {
      progress.set(currentRate);
      return;
    }
    if (reduceMotion) {
      // No sweep, but still the landing: the haptic is the change, not the motion.
      progress.set(currentRate);
      landed(arrival);
      return;
    }
    progress.set(arrival.from);
    progress.set(withTiming(currentRate, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) }));
    // Timed to the sweep rather than called back from it, so a change arriving mid-sweep cancels the
    // landing it interrupted instead of buzzing for a place the stripe never reached.
    const timer = setTimeout(() => landed(arrival), Duration.orbit);
    return () => clearTimeout(timer);
  }, [onStage, currentRate, seenKey, reduceMotion, progress]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.get()),
  }));
  // The head's light follows the arc's head exactly, computed from the same value on the UI thread.
  // Out on an empty ring and on a closed one: there is no front before the first act, and a closed
  // orbit has none either (its moment is the glint's).
  const headProps = useAnimatedProps(() => {
    const p = progress.get();
    const angle = 2 * Math.PI * p - Math.PI / 2;
    return {
      cx: RING_CENTER + RING_RADIUS * Math.cos(angle),
      cy: RING_CENTER + RING_RADIUS * Math.sin(angle),
      opacity: p > 0.002 && p < 0.998 ? 1 : 0,
    };
  });
  // A dash a little under a tenth of the ring, carried round once and faded in and out with the
  // trip, so it is gone at both ends and never needs hiding.
  const glintProps = useAnimatedProps(() => ({
    strokeDashoffset: -RING_CIRCUMFERENCE * glint.get(),
    strokeOpacity: Math.sin(Math.PI * glint.get()),
  }));
  const glintBloomProps = useAnimatedProps(() => {
    const t = glint.get();
    const angle = 2 * Math.PI * (t + GLINT_SHARE / 2) - Math.PI / 2;
    return {
      cx: RING_CENTER + RING_RADIUS * Math.cos(angle),
      cy: RING_CENTER + RING_RADIUS * Math.sin(angle),
      opacity: Math.sin(Math.PI * t),
    };
  });

  return (
    <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} style={styles.ring}>
      <Defs>
        {/* A radial gradient, not a blur: it costs nothing to move every frame of the sweep, where
            a filter would be recomputed under it. */}
        <RadialGradient id={headGlowId} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={theme.accent} stopOpacity={0.55} />
          <Stop offset="0.5" stopColor={theme.accent} stopOpacity={0.22} />
          <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={glintBloomId} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={theme.glow} stopOpacity={0.7} />
          <Stop offset="0.5" stopColor={theme.glow} stopOpacity={0.25} />
          <Stop offset="1" stopColor={theme.glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* The groove: the whole 360°, so an empty month still shows the circle there is to fill. */}
      <Circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke={theme.orbitTrack}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      {/* Butt-capped at exactly zero, round once there is an arc to cap. A round cap on a
          ZERO-length dash is still drawn — SVG renders it as a full dot — so a month you have not
          started put a bright accent mark at the top of the ring above a reading of 0°. It looked
          like the first sliver of progress, which is the one thing it could not be. (The forecast
          arrowhead had the same fault and the same fix: draw the mark only where the thing it
          marks exists.) The cap follows the target rate, not the animated value, so a sweep that
          starts from zero still rounds off the whole way up. */}
      <AnimatedCircle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke={currentColor}
        strokeWidth={RING_STROKE}
        strokeLinecap={currentRate > 0 ? 'round' : 'butt'}
        strokeDasharray={RING_CIRCUMFERENCE}
        animatedProps={arcProps}
        fill="none"
        transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
      />
      {currentRate > 0 && currentRate < 1 ? (
        <AnimatedCircle r={HEAD_GLOW_R} fill={`url(#${headGlowId})`} animatedProps={headProps} />
      ) : null}
      {currentRate >= 1 ? (
        <>
          <AnimatedCircle r={GLINT_BLOOM_R} fill={`url(#${glintBloomId})`} animatedProps={glintBloomProps} />
          <AnimatedCircle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            stroke={theme.glow}
            strokeWidth={RING_STROKE * 0.45}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE * GLINT_SHARE} ${RING_CIRCUMFERENCE}`}
            animatedProps={glintProps}
            fill="none"
            transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
          />
        </>
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  // The orbit alone, so the card closes on it. The bottom inset is the halo's: its star rays reach
  // 29pt past the rim, and the card's own 16pt padding would shear the lowest one off at the edge.
  hero: { alignItems: 'center', paddingBottom: Spacing.three },
  orbit: {
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', top: -RIM_BLEED, left: -RIM_BLEED },
  moon: { alignItems: 'center', justifyContent: 'center' },
});
