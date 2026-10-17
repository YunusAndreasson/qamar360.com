import { Canvas } from '@shopify/react-native-skia';
import { useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import {
  GLINT_SHARE,
  ORBIT_CANVAS,
  ORBIT_CANVAS_OFFSET,
  ORBIT_SIZE,
  OrbitDrawing,
  RING_CENTER,
  RING_RADIUS,
} from '@/components/orbit-drawing';
import { PressableScale } from '@/components/pressable-scale';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { Duration, Scale } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useOnStage } from '@/hooks/use-on-stage';
import type { MonthProgress } from '@/hooks/use-progress';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { moonIllumination } from '@/lib/moon';
import { orbitArrival, readOrbitSeen, writeOrbitSeen, type OrbitArrival } from '@/lib/orbit-seen';
import { clamp01, daysLeftLabel, toDegrees } from '@/lib/progress';
import { formatDegrees } from '@/lib/progress-format';

/** The halo's hairlines, as everywhere else it is drawn (`MoonHalo`). */
const HALO_OPACITY = 0.14;

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
      {/* "Month", in the same voice as the "Year" and "Lifetime" cards below it: the screen is one
          zoom-out, and each card is titled by its period alone. (It was "This month" while the
          cards below were titled differently; the hero used to lead with the date, so one card was
          headed by a category and another by a datum.) The caption is today's Hijri date, the day
          and the month: the moon's phase says how far the month has come only to someone who
          reads phases, and the day says it to everyone. No year: it is the same all year, and the
          sheet still says it.

          The ⓘ sits in the card's own top-right corner, which is where a card keeps a button about
          itself in every app anyone already uses. It replaces a line of prose — "What am I looking
          at?" — that sat under the datum and said, in twenty-one characters, exactly what this one
          glyph says. The sentence is not lost: it is the button's accessible NAME, so the words
          still reach a screen reader and only leave the screen. */}
      <StatCardHeader
        title="Month"
        trailing={`${dayOfMonth} ${monthName}`}
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
          {/* The emblem, drawn in Skia as one picture (see OrbitDrawing): the halo, the stripe,
              its light, the bloom and the moon. The halo is ornament and says so: it once faded in
              with the month's rate, a fourth encoding of progress below anything perceptible. The
              moon is the calendar and the stripe is the data, so the moon rests quiet (dimmer
              moonlight, still opaque), lights to full only when the month is done, and breathes
              slowly: tonight's moon, alive. */}
          <OrbitCanvas
            current={thisRate}
            seenKey={`${user?.id ?? ''}|${year}|${monthName}`}
            onStage={onStage}
            illumination={illumination}
            waxing={waxing}
            breath={breath}
          />
        </View>
      </PressableScale>
    </StatCard>
  );
}

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
function OrbitCanvas({
  current,
  seenKey,
  onStage,
  illumination,
  waxing,
  breath,
}: {
  current: number;
  seenKey: string;
  onStage: boolean;
  illumination: number;
  waxing: boolean;
  breath: SharedValue<number>;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // Same light-mode dimming as the halo everywhere else: dark-steel lines on a white page read far
  // stronger than pale lines on deep space.
  const haloOpacity = HALO_OPACITY * (useEffectiveScheme() === 'light' ? 0.55 : 1);
  const currentRate = clamp01(current);

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

  // Everything the drawing animates, derived here on the UI thread from the two values above, so
  // the drawing itself is a plain function of its props.
  const sweepEnd = useDerivedValue(() => Math.max(progress.get() * 360, 0.5));
  const headX = useDerivedValue(() => RING_CENTER + RING_RADIUS * Math.cos(2 * Math.PI * progress.get() - Math.PI / 2));
  const headY = useDerivedValue(() => RING_CENTER + RING_RADIUS * Math.sin(2 * Math.PI * progress.get() - Math.PI / 2));
  // No caps on an empty ring: a round cap with nothing behind it reads as the first sliver of
  // progress, which is the one thing it cannot be.
  const capOpacity = useDerivedValue(() => (progress.get() > 0.002 ? 1 : 0));
  const headGlowOpacity = useDerivedValue(() => {
    const p = progress.get();
    return p > 0.002 && p < 0.998 ? 1 : 0;
  });
  const glintEnd = useDerivedValue(() => glint.get() + GLINT_SHARE);
  const glintOpacity = useDerivedValue(() => Math.sin(Math.PI * glint.get()));
  const moonGlow = useDerivedValue(() => 1 - breath.get() * 0.07);

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <OrbitDrawing
        colors={{
          track: theme.orbitTrack,
          head: theme.accent,
          complete: theme.complete,
          glow: theme.glow,
          pattern: theme.pattern,
          base: theme.backgroundElement,
        }}
        haloOpacity={haloOpacity}
        closed={currentRate >= 1}
        illumination={illumination}
        waxing={waxing}
        progress={progress}
        sweepEnd={sweepEnd}
        headX={headX}
        headY={headY}
        capOpacity={capOpacity}
        headGlowOpacity={headGlowOpacity}
        glintStart={glint}
        glintEnd={glintEnd}
        glintOpacity={glintOpacity}
        moonGlow={moonGlow}
      />
    </Canvas>
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
  // The canvas is the halo's square, centred on the orbit's box and running past it on every side.
  canvas: {
    position: 'absolute',
    top: ORBIT_CANVAS_OFFSET,
    left: ORBIT_CANVAS_OFFSET,
    width: ORBIT_CANVAS,
    height: ORBIT_CANVAS,
  },
});
