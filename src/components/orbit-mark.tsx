import { useEffect, useRef } from 'react';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Duration, Ease, Tick } from '@/constants/motion';
import { useTheme } from '@/hooks/use-theme';
import { clamp01, ringMetrics } from '@/lib/progress';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The orbit at glyph size: a day in Today's week bar, a month in the Year card. One size for both,
 * so the two read as the same mark.
 *
 * Sized from the number it holds, not from the room it has. The ring is the most legible thing in
 * the mark (a closed or open circle reads at any size), so it needs no more than to clear two 14pt
 * digits with a little air: at 28 "30" has about 3pt each side, where at 26 it touches the stroke.
 * At 32 it was 2.3 times the number and nearly three times the moon beneath it, and read as the
 * subject of a mark whose subject is the day. The stroke is about a text stem's weight at 14pt, so
 * ring and numeral are drawn in the same line.
 */
export const ORBIT_GLYPH = 28;
export const ORBIT_GLYPH_STROKE = 2;
/**
 * How far the number inside a glyph orbit may grow with the system text size. The ring is fixed, so
 * the number's room is too: at the dense-label cap (1.3×) "30" is 22.7pt wide and its corners cut
 * the stroke, where at 1.15× they clear it by about a point (measured on Inter's own advances).
 */
export const ORBIT_GLYPH_TEXT_SCALE = 1.15;

/**
 * A span of days as the moon draws it, at glyph size: an orbit filled to how much of it was kept.
 *
 * The Progress hero's stripe in small, so it is read the same way wherever it appears: the groove
 * (`orbitTrack`) is the whole span, the accent arc is what was kept, running clockwise from the
 * top, and an orbit kept in full closes in the moon's warm light (`complete`), as the hero does at
 * 360°. A day wears one in Today's week bar, and a month in the Year card.
 *
 * `rate` null draws no arc, and `groove` false no groove: a day that asked for nothing has no orbit
 * to keep, which is not the same as an empty one, and is drawn as nothing rather than as a miss.
 *
 * `animate` is for the orbit that moves under your hand (the day you are ticking): the arc walks to
 * its new length on the tick's own sweep clock, and on closing turns warm as the sweep lands. Every
 * other orbit only ever lands, and a mount is always the settled state.
 *
 * `follow` hands the arc to a clock outside the mark: the year's running month follows the moon's
 * own stripe, so the two fill on one sweep and close together.
 */
export function OrbitMark({
  rate,
  size,
  strokeWidth,
  groove = true,
  kept = rate !== null && rate >= 1,
  animate = false,
  follow,
}: {
  rate: number | null;
  size: number;
  strokeWidth: number;
  groove?: boolean;
  /** Closed and warm. Defaults to the rate reaching 1; a caller that reads the span in rounded
   *  degrees passes its own, so the mark agrees with the figure beside it. */
  kept?: boolean;
  animate?: boolean;
  /** A 0–1 clock to draw the arc from instead of `rate`; warm once it closes the orbit. */
  follow?: SharedValue<number>;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const target = kept ? 1 : clamp01(rate ?? 0);
  const { radius, ringRadius, circumference } = ringMetrics(size, strokeWidth, target);

  const progress = useSharedValue(target);
  const warm = useSharedValue(kept ? 1 : 0);
  const was = useRef({ target, kept });
  useEffect(() => {
    const from = was.current;
    was.current = { target, kept };
    if (from.target === target && from.kept === kept) return;
    if (!animate || reduceMotion) {
      progress.set(target);
      warm.set(kept ? 1 : 0);
      return;
    }
    if (kept && !from.kept) {
      // Closing: the arc sweeps shut, then the closed orbit warms as the sweep lands.
      progress.set(withTiming(1, { duration: Tick.sweep, easing: Ease.draw }));
      warm.set(withDelay(Tick.sweep, withTiming(1, { duration: Tick.settle })));
      return;
    }
    // Opening again, or a part of the day moving: no ceremony either way, only the new length.
    warm.set(withTiming(kept ? 1 : 0, { duration: Duration.fast }));
    progress.set(withTiming(target, { duration: Tick.sweep, easing: Ease.draw }));
  }, [target, kept, animate, reduceMotion, progress, warm]);

  // A zero-length dash can still paint a sliver, so the arc hides until it has any length.
  const arcProps = useAnimatedProps(() => {
    const p = follow ? follow.get() : progress.get();
    const w = follow ? (p >= 1 ? 1 : 0) : warm.get();
    return { strokeDashoffset: circumference * (1 - p), opacity: p < 0.004 ? 0 : 1 - w };
  });
  const warmProps = useAnimatedProps(() => ({ opacity: follow ? (follow.get() >= 1 ? 1 : 0) : warm.get() }));

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {groove ? (
        <Circle cx={radius} cy={radius} r={ringRadius} stroke={theme.orbitTrack} strokeWidth={strokeWidth} fill="none" />
      ) : null}
      {rate !== null ? (
        <>
          <AnimatedCircle
            cx={radius}
            cy={radius}
            r={ringRadius}
            stroke={theme.accent}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={arcProps}
            fill="none"
            transform={`rotate(-90 ${radius} ${radius})`}
          />
          <AnimatedCircle
            cx={radius}
            cy={radius}
            r={ringRadius}
            stroke={theme.complete}
            strokeWidth={strokeWidth}
            animatedProps={warmProps}
            fill="none"
          />
        </>
      ) : null}
    </Svg>
  );
}
