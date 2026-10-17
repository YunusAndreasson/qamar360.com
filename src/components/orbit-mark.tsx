import { useEffect, useRef } from 'react';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Duration, Tick } from '@/constants/motion';
import { useTheme } from '@/hooks/use-theme';
import { clamp01, ringMetrics } from '@/lib/progress';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A span of days as the moon draws it, at glyph size: an orbit filled to how much of it was kept.
 *
 * The Progress hero's stripe in small, so it is read the same way wherever it appears: the groove
 * (`orbitTrack`) is the whole span, the accent arc is what was kept, running clockwise from the
 * top, and an orbit kept in full closes in the moon's warm light (`complete`), as the hero does at
 * 360°. A month wears one in the year card's scrub caption; a day wears one in Today's week bar and
 * in the calendar.
 *
 * `rate` null draws no arc, and `groove` false no groove: a day that asked for nothing has no orbit
 * to keep, which is not the same as an empty one, and is drawn as nothing rather than as a miss.
 *
 * `animate` is for the orbit that moves under your hand (the day you are ticking): the arc walks to
 * its new length on the tick's own sweep clock, and on closing turns warm as the sweep lands. Every
 * other orbit only ever lands, and a mount is always the settled state.
 */
export function OrbitMark({
  rate,
  size,
  strokeWidth,
  groove = true,
  kept = rate !== null && rate >= 1,
  animate = false,
}: {
  rate: number | null;
  size: number;
  strokeWidth: number;
  groove?: boolean;
  /** Closed and warm. Defaults to the rate reaching 1; a caller that reads the span in rounded
   *  degrees passes its own, so the mark agrees with the figure beside it. */
  kept?: boolean;
  animate?: boolean;
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
      progress.set(withTiming(1, { duration: Tick.sweep, easing: Easing.out(Easing.cubic) }));
      warm.set(withDelay(Tick.sweep, withTiming(1, { duration: Tick.settle })));
      return;
    }
    // Opening again, or a part of the day moving: no ceremony either way, only the new length.
    warm.set(withTiming(kept ? 1 : 0, { duration: Duration.fast }));
    progress.set(withTiming(target, { duration: Tick.sweep, easing: Easing.out(Easing.cubic) }));
  }, [target, kept, animate, reduceMotion, progress, warm]);

  // A zero-length dash can still paint a sliver, so the arc hides until it has any length.
  const arcProps = useAnimatedProps(() => {
    const p = progress.get();
    return { strokeDashoffset: circumference * (1 - p), opacity: p < 0.004 ? 0 : 1 - warm.get() };
  });
  const warmProps = useAnimatedProps(() => ({ opacity: warm.get() }));

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
