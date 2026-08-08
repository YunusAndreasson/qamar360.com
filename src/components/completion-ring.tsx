import { useEffect, useRef } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Duration, Tick } from '@/constants/motion';
import { useTheme } from '@/hooks/use-theme';
import { ringMetrics } from '@/lib/progress';

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
 * The day's completion mark — a ring that resolves to a check, NEVER a moon. A full moon is a
 * lunar-phase (calendar) idea; "done" is a different idea, so the two are kept apart: the Progress
 * grid carries the moons, the day carries this ring.
 *
 * Worn by the two things the app actually tracks — a stack card's header (sealing the sequence)
 * and an exchange row (holding the deed) — so both commits read as the same gesture in the same
 * column, whatever their unit.
 *
 * Open is a hollow ring in `text` — the same tone as the title it sits beside, so an unfinished unit
 * reads as one bright thing (the row's press highlight shows through it). At rest, done does NOT
 * stay lit: the ring closes around a small check, both in `textDisabled` — the exact muted tone of
 * the receded label beside it — so a finished unit recedes as one quiet thing. A check, not a
 * filled dot: ring-with-dot reads as a radio button's "selected", and a solid disc reads as a moon
 * (which belongs to Progress).
 *
 * The *moment* of completion, though, is the app's joy beat, on the shared `Tick` clock (see
 * constants/motion, where the celebrate haptic reads the same numbers): the accent arc sweeps the
 * ring shut — the Progress orbit's signature motion at day scale — the check draws in as the sweep
 * lands, and the lit mark then cross-fades to the quiet done tone: it lights, then rests. On a
 * stack card this is the same clock {@link StackCompleteFlash} blooms its border on, so mark, ring
 * and haptic land as one event. Un-doing gets no ceremony — the done mark dissolves fast and the
 * open ring remains.
 *
 * All motion is Reanimated `useAnimatedProps` on the SVG stroke (the codebase-proven path — the
 * hero orbit and year line animate exactly this way; UI-thread prop updates repaint fine on
 * Fabric, unlike the re-render prop updates that needed the old `key={arc}` remount hack).
 * Mount is always the settled state — a card that loads already-sealed never animates — and Reduce
 * Motion lands every change instantly.
 */
export function CompletionRing({
  complete,
  size,
  strokeWidth,
  settling = false,
}: {
  /** Done for the viewed day — a stack sealed, or an exchange held. */
  complete: boolean;
  size: number;
  strokeWidth: number;
  /**
   * The viewed day's completions are being (re)fetched after a day-step — `complete` may still
   * flip from the blanked pre-fetch state to the day's real truth while this is true, which is
   * data catching up, not a fresh commit. Suppresses the sweep for that one transition so a stack
   * already sealed on the newly-viewed day renders settled instead of replaying its seal.
   */
  settling?: boolean;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { radius, ringRadius, circumference } = ringMetrics(size, strokeWidth, complete ? 1 : 0);
  const checkPath = checkPathFor(size);
  const checkLength = checkLengthFor(size);

  // The mark's four dimensions, born at the mounted value's resting state:
  //   progress  — the accent arc's fill (0–1 of the circumference)
  //   checkDraw — how much of the check is drawn (0 hidden → 1 full)
  //   flash     — the lit accent layer's opacity (arc + drawing check)
  //   quiet     — the muted done layer's opacity (closed ring + check at rest)
  const progress = useSharedValue(complete ? 1 : 0);
  const checkDraw = useSharedValue(complete ? 1 : 0);
  const flash = useSharedValue(complete ? 0 : 1);
  const quiet = useSharedValue(complete ? 1 : 0);

  // No explicit mount-skip: on the first run `was === complete` and every shared value was born
  // at that state's rest, so the effect's early return is reached before anything animates —
  // cards that load already-sealed render settled.
  const wasComplete = useRef(complete);
  // A day-step blanks `complete` to `false` and re-fetches; `settling` covers that window. Reading
  // the PRIOR render's `settling` (not this one's) matters because the fetch's own commit can flip
  // `settling` back to `false` in the very same render that `complete` catches up — so a plain
  // `if (settling) return` would miss exactly the render it needs to catch.
  const wasSettling = useRef(settling);
  useEffect(() => {
    const was = wasComplete.current;
    const wasSettlingBefore = wasSettling.current;
    wasComplete.current = complete;
    wasSettling.current = settling;
    if (was === complete) return;
    if (settling || wasSettlingBefore) return; // the day's data catching up, not a fresh commit
    if (reduceMotion) {
      // Land on the resting state — the shape change alone conveys completion.
      progress.set(complete ? 1 : 0);
      checkDraw.set(complete ? 1 : 0);
      flash.set(complete ? 0 : 1);
      quiet.set(complete ? 1 : 0);
      return;
    }
    if (complete) {
      // The commit: sweep the ring shut, draw the check in on the sweep's heels, then let the lit
      // mark settle into the quiet done tone. Explicit resets first so a re-seal that interrupts a
      // mid-flight undo starts from a known state.
      quiet.set(0);
      flash.set(1);
      checkDraw.set(0);
      progress.set(withTiming(1, { duration: Tick.sweep, easing: Easing.out(Easing.cubic) }));
      checkDraw.set(withDelay(Tick.checkDelay, withTiming(1, { duration: Tick.check, easing: Easing.out(Easing.cubic) })));
      quiet.set(withDelay(Tick.settleDelay, withTiming(1, { duration: Tick.settle })));
      flash.set(withDelay(Tick.settleDelay, withTiming(0, { duration: Tick.settle })));
      return;
    }
    // Un-done: no ceremony. The done mark dissolves fast and the empty ring is simply there again —
    // an accent unwind from full would be a bright reverse-ceremony saying nothing.
    checkDraw.set(0);
    flash.set(1);
    quiet.set(withTiming(0, { duration: Duration.fast }));
    progress.set(0);
  }, [complete, settling, reduceMotion, progress, checkDraw, flash, quiet]);

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
  // The open track is the exact inverse of the quiet layer, so the two cross-fade rather than
  // stack: an unfilled ring carries the full title tone, and a done one is only ever the muted
  // mark. Fading it out (instead of leaving it underneath) is what keeps the brighter stroke from
  // fringing the edges of the muted circle drawn over it.
  const trackProps = useAnimatedProps(() => ({ opacity: 1 - quiet.get() }));

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* The open track the arc fills over — `text`, the same tone as the title beside it, so an
          unfinished unit reads as one bright thing rather than a strong label with a faint mark.
          (It was `controlTrack`, the interactive-outline step: legible, but a full stop dimmer than
          the name it belongs to.) */}
      <AnimatedCircle
        cx={radius}
        cy={radius}
        r={ringRadius}
        stroke={theme.text}
        strokeWidth={strokeWidth}
        animatedProps={trackProps}
        fill="none"
      />
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
