import { useEffect, useId } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Stop } from 'react-native-svg';

import { Meteor } from '@/constants/motion';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';

/**
 * A meteor — one faint hairline that slips across the upper sky, then a long randomized wait
 * (see {@link Meteor}). Deliberately the rarest, quietest thing in the app: the read is "was that
 * a shooting star? …I think so", never an effect. A single streak whose start / angle / length
 * are re-rolled each pass and whose whole flight (position + a fade-in-out envelope) runs on the
 * UI thread via shared values — no React re-renders. Dark nights only — a real meteor needs a
 * dark sky, so none is scheduled until the real sun is deep below the horizon (this holds even
 * while the daylight stars keep their dark-mode floor) — and never under Reduce Motion.
 */

/** The visible trail: short and hairline-thin, with a low peak opacity — a whisper, not a flare. */
const STREAK_LEN = 88;
const STREAK_THICK = 1.6;
const PEAK = 0.35;

export function Meteors({ sunAlt }: { sunAlt: number }) {
  const scheme = useEffectiveScheme();
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  const gradId = useId();
  const { width, height } = useWindowDimensions();

  const progress = useSharedValue(0);
  const baseLeft = useSharedValue(0);
  const baseTop = useSharedValue(0);
  const angle = useSharedValue(0);
  const distance = useSharedValue(0);

  // Meteors are a dark-night thing — light mode, daylight/twilight (sun above nautical dark),
  // and Reduce Motion simply never schedule one.
  const active = scheme === 'dark' && !reduceMotion && sunAlt < -12;

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;

    const fire = () => {
      if (!mounted) return;
      // Re-roll the pass: start high in the upper sky, a shallow descending diagonal either way.
      baseLeft.set((0.15 + Math.random() * 0.55) * width);
      baseTop.set((0.04 + Math.random() * 0.18) * height);
      const descend = (20 + Math.random() * 15) * (Math.PI / 180); // 20–35° below horizontal
      angle.set(Math.random() < 0.5 ? descend : Math.PI - descend);
      distance.set((0.3 + Math.random() * 0.15) * width);
      progress.set(0);
      progress.set(withTiming(1, { duration: Meteor.travel, easing: Easing.linear }));
      schedule();
    };
    const schedule = () => {
      const [min, max] = Meteor.gap;
      timer = setTimeout(fire, min + Math.random() * (max - min));
    };

    schedule();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [active, width, height, progress, baseLeft, baseTop, angle, distance]);

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      // Fade in to peak at mid-flight, then out — the streak is never fully lit at its edges.
      opacity: Math.sin(Math.PI * p) * PEAK,
      transform: [
        { translateX: baseLeft.get() },
        { translateY: baseTop.get() },
        { rotate: `${angle.get()}rad` },
        { translateX: p * distance.get() }, // travel along the streak's own axis
      ],
    };
  });

  return (
    <Animated.View style={[styles.streak, style]} pointerEvents="none">
      <Svg width={STREAK_LEN} height={STREAK_THICK * 3} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Bright head leading (+x), fading to a transparent tail behind. */}
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={theme.starlight} stopOpacity="0" />
            <Stop offset="1" stopColor={theme.starlight} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Line
          x1="0"
          y1={STREAK_THICK * 1.5}
          x2={STREAK_LEN}
          y2={STREAK_THICK * 1.5}
          stroke={`url(#${gradId})`}
          strokeWidth={STREAK_THICK}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  streak: { position: 'absolute', left: 0, top: 0, width: STREAK_LEN, height: STREAK_THICK * 3 },
});
