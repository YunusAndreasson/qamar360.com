import { useEffect, useRef } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Duration, Spring, Tick } from '@/constants/motion';
import { useTheme } from '@/hooks/use-theme';
import { clamp01, ringMetrics } from '@/lib/progress';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// The checkmark's three anchor points as fractions of the box (tip → elbow → tail), shared by
// the path `d` and the draw-in length so the dash math can never drift from the drawing.
const CHECK = { x1: 0.31, y1: 0.52, x2: 0.44, y2: 0.65, x3: 0.69, y3: 0.37 } as const;
const checkPathFor = (size: number) =>
  `M ${size * CHECK.x1} ${size * CHECK.y1} L ${size * CHECK.x2} ${size * CHECK.y2} L ${size * CHECK.x3} ${size * CHECK.y3}`;
const checkLengthFor = (size: number) =>
  Math.hypot(size * (CHECK.x2 - CHECK.x1), size * (CHECK.y2 - CHECK.y1)) +
  Math.hypot(size * (CHECK.x3 - CHECK.x2), size * (CHECK.y3 - CHECK.y2));

/**
 * A checklist item's completion mark — a ring that resolves to a check, NEVER a moon. A full moon
 * is a lunar-phase (calendar) idea; "task done" is a different idea, so the two are kept apart:
 * the Progress grid carries the moons, the daily checklist carries this ring.
 *
 * Open is a quiet hollow ring (the row's press highlight shows through). A count goal fills the
 * ring partway in the accent steel, the arc gliding between fractions as the stepper ticks. At
 * rest, done does NOT stay lit: the ring closes around a small check, both in `textDisabled` —
 * the exact muted tone of the struck-through label — so a finished habit recedes as one quiet
 * unit. A check, not a filled dot: ring-with-dot reads as a radio button's "selected", and a
 * solid disc reads as a moon (which belongs to Progress).
 *
 * The *moment* of completion, though, is the app's joy beat, on the shared `Tick` clock (see
 * constants/motion, where the celebrate haptic reads the same numbers): the accent arc sweeps
 * the ring shut — the Progress orbit's signature motion at checklist scale — the check draws in
 * as the sweep lands, and the lit mark then cross-fades to the quiet done tone: it lights, then
 * rests. Un-ticking gets no ceremony — the done mark dissolves fast and the open ring remains.
 *
 * All motion is Reanimated `useAnimatedProps` on the SVG stroke (the codebase-proven path —
 * the hero orbit and year line animate exactly this way; UI-thread prop updates repaint fine on
 * Fabric, unlike the re-render prop updates that needed the old `key={arc}` remount hack).
 * Mount is always the settled state — rows that load already-done never animate — and Reduce
 * Motion lands every change instantly.
 */
export function CompletionRing({
  fraction,
  size,
  strokeWidth,
}: {
  /** Completion 0–1 — a binary habit is 0 or 1; a count goal is count ÷ target. */
  fraction: number;
  size: number;
  strokeWidth: number;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const target = clamp01(fraction);
  const { isComplete: complete, radius, ringRadius, circumference } = ringMetrics(size, strokeWidth, target);
  const checkPath = checkPathFor(size);
  const checkLength = checkLengthFor(size);

  // The mark's four dimensions, born at the mounted value's resting state:
  //   progress  — the accent arc's fill (0–1 of the circumference)
  //   checkDraw — how much of the check is drawn (0 hidden → 1 full)
  //   flash     — the lit accent layer's opacity (arc + drawing check)
  //   quiet     — the muted done layer's opacity (closed ring + check at rest)
  const progress = useSharedValue(target);
  const checkDraw = useSharedValue(complete ? 1 : 0);
  const flash = useSharedValue(complete ? 0 : 1);
  const quiet = useSharedValue(complete ? 1 : 0);

  // No explicit mount-skip: on the first run `was === complete` and `progress` was born at
  // `target`, so every reachable branch is a zero-displacement no-op — rows that load
  // already-done render settled without animating.
  const wasComplete = useRef(complete);
  useEffect(() => {
    const was = wasComplete.current;
    wasComplete.current = complete;
    if (reduceMotion) {
      // Land on the resting state — the shape change alone conveys completion.
      progress.set(target);
      checkDraw.set(complete ? 1 : 0);
      flash.set(complete ? 0 : 1);
      quiet.set(complete ? 1 : 0);
      return;
    }
    if (complete && !was) {
      // The tick: sweep the ring shut, draw the check in on the sweep's heels, then let the
      // lit mark settle into the quiet done tone. Explicit resets first so a re-tick that
      // interrupts a mid-flight undo starts from a known state.
      quiet.set(0);
      flash.set(1);
      checkDraw.set(0);
      progress.set(withTiming(1, { duration: Tick.sweep, easing: Easing.out(Easing.cubic) }));
      checkDraw.set(withDelay(Tick.checkDelay, withTiming(1, { duration: Tick.check, easing: Easing.out(Easing.cubic) })));
      quiet.set(withDelay(Tick.settleDelay, withTiming(1, { duration: Tick.settle })));
      flash.set(withDelay(Tick.settleDelay, withTiming(0, { duration: Tick.settle })));
      return;
    }
    if (!complete && was) {
      // Un-tick: no ceremony. The done mark dissolves fast; beneath it a stepped-down count
      // goal's arc unwinds to the logged fraction (informative — it shows where the day now
      // stands), while a binary habit lands instantly on the empty ring — an accent unwind
      // from full would be a bright reverse-ceremony saying nothing.
      checkDraw.set(0);
      flash.set(1);
      quiet.set(withTiming(0, { duration: Duration.fast }));
      progress.set(target > 0 ? withSpring(target, Spring.settle) : 0);
      return;
    }
    // A count goal stepping within the open range — the arc glides to the new fraction.
    progress.set(withSpring(target, Spring.settle));
  }, [target, complete, reduceMotion, progress, checkDraw, flash, quiet]);

  // Zero-length dashes with round caps can render as a stray dot, so each stroke hides
  // itself entirely until it has any length to show.
  const arcProps = useAnimatedProps(() => {
    const p = progress.get();
    return {
      strokeDashoffset: circumference * (1 - p),
      opacity: p < 0.004 ? 0 : flash.get(),
    };
  });
  const flashCheckProps = useAnimatedProps(() => {
    const d = checkDraw.get();
    return {
      strokeDashoffset: checkLength * (1 - d),
      opacity: d < 0.02 ? 0 : flash.get(),
    };
  });
  // One worklet for the whole quiet layer — both nodes fade as a single unit.
  const quietProps = useAnimatedProps(() => ({ opacity: quiet.get() }));

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* The open track the arc fills over. */}
      <Circle cx={radius} cy={radius} r={ringRadius} stroke={theme.controlTrack} strokeWidth={strokeWidth} fill="none" />
      {/* The flash: the accent arc (12 o'clock, clockwise — same as the Progress orbit)
          and the check that draws in behind its landing. */}
      <AnimatedCircle
        cx={radius}
        cy={radius}
        r={ringRadius}
        stroke={theme.accent}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        animatedProps={arcProps}
        fill="none"
        transform={`rotate(-90 ${radius} ${radius})`}
      />
      <AnimatedPath
        d={checkPath}
        stroke={theme.accent}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={checkLength}
        animatedProps={flashCheckProps}
        fill="none"
      />
      {/* The quiet done mark the flash settles into — the resting state. */}
      <AnimatedCircle
        cx={radius}
        cy={radius}
        r={ringRadius}
        stroke={theme.textDisabled}
        strokeWidth={strokeWidth}
        animatedProps={quietProps}
        fill="none"
      />
      <AnimatedPath
        d={checkPath}
        stroke={theme.textDisabled}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        animatedProps={quietProps}
        fill="none"
      />
    </Svg>
  );
}
