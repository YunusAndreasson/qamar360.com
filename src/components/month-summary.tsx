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
import Svg, { Circle } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { MoonPhase } from '@/components/moon-phase';
import { HeroGlow } from '@/components/ornament/hero-glow';
import { MoonHalo } from '@/components/ornament/moon-halo';
import { PressableScale } from '@/components/pressable-scale';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { TallyDegrees } from '@/components/tally-degrees';
import { ThemedText } from '@/components/themed-text';
import { Duration, Scale } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import { useOnStage } from '@/hooks/use-on-stage';
import type { MonthProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { moonIllumination } from '@/lib/moon';
import { clamp01, daysLeftLabel, toDegrees } from '@/lib/progress';

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
// The canvas used to run 16pt wider on every side to make room for a tick that protruded past the
// rim. Nothing is drawn outside the ring any more, so the drawing surface is the ring's own
// footprint — plus a hair, because the stroke's outer edge lands exactly on it and an SVG clips to
// its bounds, which would shave the antialiasing off the rim.
const RIM_BLEED = 2;
const SVG_SIZE = ORBIT_SIZE + RIM_BLEED * 2;
const RING_CENTER = SVG_SIZE / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * How this month is going against your usual — said in words, under the datum.
 *
 * This replaced a caret outside the ring's rim. A mark at your average position made the reader do
 * the work: find the tick, find the arc head, judge which is further round a circle, and remember
 * which of three unlabelled things the tick was. It also cost a legend row in the sheet, because an
 * abstract mark needs a key. A sentence needs none — that is the whole trade — so the ring is down
 * to a progress bar and its target, and the sheet to the two things actually drawn on it.
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
  // Compared in DEGREES, the unit the card shows, so the sentence can never disagree with the
  // number above it about which side of your usual you are on.
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

  const { monthName, year, dayOfMonth, monthLength, thisRate, paceRate, averageRate, monthsAveraged } = month;
  const thisDegrees = toDegrees(thisRate);
  // Where the month itself stands — what it has asked of you so far, on the same orbit scale. The
  // one benchmark that exists on a first day, so the ring always has a mark to catch.
  const paceDegrees = toDegrees(paceRate);
  // Your usual by this same day, on the *same* absolute orbit scale as the headline — so the two
  // read as comparable positions (188° vs 360°), and the number is exactly where the caret sits.
  // No signed delta to be misread as a position.
  // What "Day 11 of 29" was really for, said as the answer rather than the inputs: nobody wants the
  // ordinal, they want to know how much month is left to fix it in. It moved off the header when
  // the month's name took the caption slot, and it lands here because it belongs beside the
  // verdict — where you stand, and how long you have.
  const reading = [usualLabel(month), daysLeftLabel(month)].filter(Boolean).join(' · ');
  const { illumination, waxing } = moonIllumination(dayOfMonth, monthLength);
  const a11y = [
    `${monthName} ${year}, day ${dayOfMonth} of ${monthLength}.`,
    `This month is at ${thisDegrees} degrees of the orbit; the month itself has reached ${paceDegrees} degrees.`,
    // The figure and the count are said here and nowhere on screen. The card gives the verdict,
    // which is what was asked for; this gives the measurement behind it, for anyone who wants to
    // know what "usual" was counted from.
    monthsAveraged > 0
      ? `Usually ${toDegrees(averageRate)} degrees by this day, averaged over ${monthsAveraged} previous ${monthsAveraged === 1 ? 'month' : 'months'}.`
      : '',
    reading,
  ]
    .filter(Boolean)
    .join(' ');

  // The sheet reads a snapshot of what was tapped, passed along rather than re-derived: mounting
  // the progress hook a second time would fire a fetch to re-answer a question already on screen,
  // and a detail view that disagrees with the card it opened from is worse than a stale one.
  const openReading = () =>
    router.push({
      pathname: '/(tabs)/insights/orbit',
      params: {
        monthName,
        year: String(year),
        current: String(thisDegrees),
        pace: String(paceDegrees),
      },
    });

  return (
    <StatCard pattern>
      {/* "This month" — a title, the way the card below is titled "Over time". The two are the
          screen's two scopes and now say so in the same voice; the hero used to lead with the date
          instead, so one card was headed by a category and the other by a datum, and only one of
          them told you what it was for. The month's NAME is the caption, which is where the app
          says which Hijri month you are in — this header is the only place at rest that does.

          The ⓘ sits in the card's own top-right corner, which is where a card keeps a button about
          itself in every app anyone already uses. It replaces a line of prose — "What am I looking
          at?" — that sat under the datum and said, in twenty-one characters, exactly what this one
          glyph says. The sentence is not lost: it is the button's accessible NAME, so the words
          still reach a screen reader and only leave the screen. */}
      <StatCardHeader
        title="This month"
        trailing={`${monthName} ${year} H`}
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
          <MoonHalo size={HALO_SIZE} />
          <ProgressOrbit current={thisRate} pace={paceRate} />
          {/* The moon is the calendar, the orbit ring is the data — so the moon rests quiet (dimmer
              moonlight, still opaque) and lets the bright ring + the degrees readout lead,
              brightening to full only when the month is done (where the glow also lights). It
              breathes slowly — tonight's moon, alive. */}
          <Animated.View style={[styles.moon, moonBreath]}>
            <MoonPhase illumination={illumination} waxing={waxing} size={MOON_SIZE} brightness={thisRate >= 1 ? 1 : 0.8} />
          </Animated.View>
        </View>

        {/* The datum, and the one thing the ring cannot say. The benchmark readings that used to
            sit here as glyph-and-number legends live in the sheet the ⓘ opens: three quiet lines
            under a 232pt orbit read as a footnote to it rather than as the instrument's key.
            What comes back is not a legend and not an affordance — it is a reading, the answer to
            the question a benchmark is FOR ("am I doing better than I usually do?"), which the
            ring used to pose as a triangle and leave you to work out. */}
        <View style={styles.reading}>
          <TallyDegrees degrees={thisDegrees} />
          <ThemedText type="smallCompact" themeColor="textSecondary">
            {reading}
          </ThemedText>
        </View>
      </PressableScale>
    </StatCard>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The month as three readings on one ring:
 *
 *   orbitTrack   the month still to come
 *   orbitPace    the month elapsed — what it has asked of you (always present)
 *   accent / complete  you
 *
 * and nothing else. There is no fourth mark: what you are doing against your usual is said in
 * words under the ring (see {@link usualLabel}), because it is a comparison, and a comparison read
 * off two positions on a circle is arithmetic where a sentence is an answer.
 *
 * **There were four bands, then three marks, and now two.** Last month used to be a third tonal step
 * (`accentTrackStrong`) between the other two, which made the ring three shades of one hue with
 * only their lightness to tell them apart — and those track tones are deliberately sub-3:1, being
 * informational rather than text. It worked while two legend rows sat under the orbit naming them.
 * They don't any more (the reading moved into a sheet), and an unlabelled band between two other
 * unlabelled bands is not a benchmark, it is a smudge. The caret survives that loss where a band
 * cannot, because it is distinguished by SHAPE: you can see it is a different kind of mark without
 * being told what it means, and then be told once.
 *
 * The caret that survived that cut is gone too, for a related reason: it was distinguishable, but
 * only ever as "some benchmark" until you had been told which. A mark earns its place on this ring
 * by being something you can SEE about the month — where you are, and how much has been asked. Your
 * usual is neither; it is a judgement about the two, and judgements read better as words.
 *
 * What remains is a progress bar with a target mark, which is a thing people already know how to
 * read. The elapsed stretch is still an ARC rather than a point, because a point on a ring is
 * ambiguous where 0° and 360° meet at the top; an arc *length* is not, and the stretch where the
 * dimmer band shows past the bright one IS the gap — read directly, with no arithmetic.
 */
function ProgressOrbit({ current, pace }: { current: number; pace: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const currentRate = clamp01(current);
  const paceRate = clamp01(pace);
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
  return (
    <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} style={styles.ring}>
      {/* The month still to come — the dimmest step, so the elapsed stretch above it reads as a
          brightening rather than as a separate object laid on top. */}
      <Circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke={theme.orbitTrack}
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
          stroke={theme.orbitPace}
          strokeWidth={RING_STROKE}
          strokeDasharray={`${paceArc} ${RING_CIRCUMFERENCE}`}
          fill="none"
          transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
        />
      ) : null}
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
  ring: { position: 'absolute', top: -RIM_BLEED, left: -RIM_BLEED },
  moon: { alignItems: 'center', justifyContent: 'center' },
  // The verdict belongs to the number, not to the card's rhythm — a tighter gap than the
  // orbit→datum one above it, so the two read as one block.
  reading: { alignItems: 'center', gap: Spacing.one },
});
