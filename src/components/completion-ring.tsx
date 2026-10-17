import { useEffect, useRef } from 'react';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Duration, Ease, Tick } from '@/constants/motion';
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
 * The day's completion mark — a ring that resolves to a check, NEVER a moon. A full moon is a
 * lunar-phase (calendar) idea; "done" is a different idea, so the two are kept apart: the Progress
 * grid carries the moons, the day carries this ring.
 *
 * Worn by everything the app tracks — a stack card's header, an act inside it, an exchange row, a
 * to-do — so every commit reads as the same gesture in the same column, whatever its unit. Inside a
 * stack the mark is drawn smaller for the acts than for the header above them, and that size
 * difference is the whole hierarchy: the parts are smaller than the sum.
 *
 * **It also fills.** A ring given a `fraction` rests part-drawn, the accent arc showing exactly how
 * much of the group is done — a stack of ten with five ticked is a half-filled ring. Progress you
 * can see is the point (Norman's visibility of system status): the mark answers "how far in am I"
 * before you have unfolded anything, and each act you tick advances it on the seal's own sweep
 * clock, so a tick and a seal are visibly the same motion at different lengths.
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
  fraction,
  size,
  strokeWidth,
  settling = false,
}: {
  /** Done for the viewed day — a stack sealed, an act ticked, or an exchange held. */
  complete: boolean;
  /**
   * How much of the ring stands filled while it is NOT complete (0–1) — a group's parts done over
   * its parts in play. Omitted on a binary mark, which is only ever empty or shut; `complete`
   * always wins, so a sealed ring is full whatever this says.
   */
  fraction?: number;
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
  // Where the arc rests. A complete mark is full by definition, so `fraction` only ever speaks
  // for the in-between.
  const target = complete ? 1 : clamp01(fraction ?? 0);
  const { radius, ringRadius, circumference } = ringMetrics(size, strokeWidth, target);
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

  // No explicit mount-skip: on the first run `was === complete` and every shared value was born
  // at that state's rest, so the effect's early return is reached before anything animates —
  // cards that load already-sealed render settled.
  const wasComplete = useRef(complete);
  // The arc's own last resting place, tracked beside `complete` so a partial move (one act of five
  // ticked) is recognised as a change at all — `complete` does not budge for it.
  const wasTarget = useRef(target);
  // A day-step blanks `complete` to `false` and re-fetches; `settling` covers that window. Reading
  // the PRIOR render's `settling` (not this one's) matters because the fetch's own commit can flip
  // `settling` back to `false` in the very same render that `complete` catches up — so a plain
  // `if (settling) return` would miss exactly the render it needs to catch.
  const wasSettling = useRef(settling);
  useEffect(() => {
    const was = wasComplete.current;
    const from = wasTarget.current;
    const wasSettlingBefore = wasSettling.current;
    wasComplete.current = complete;
    wasTarget.current = target;
    wasSettling.current = settling;
    if (was === complete && from === target) return;
    // Two changes that must not be *performed*, only *landed*: Reduce Motion (the shape change
    // alone conveys completion) and a day-step's data catching up (`settling` — not a fresh
    // commit, so it gets no ceremony).
    //
    // Landing is the whole point, and skipping it was a bug: a `return` here freezes the mark at
    // whatever the shared values were BORN as. On a day-step the card remounts (`key={viewDate}`
    // in the Today list) one render before the sets are blanked, so they are born holding the
    // DEPARTING day's answer — and every later transition to the new day's truth is suppressed by
    // this very guard. The mark then contradicts the row it sits in: an open stack wearing a
    // check, or a sealed one wearing an empty ring, with the greyed title beside it telling the
    // truth. Snap to the resting state instead, and the mark is right whichever day you land on.
    if (reduceMotion || settling || wasSettlingBefore) {
      progress.set(target);
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
      progress.set(withTiming(1, { duration: Tick.sweep, easing: Ease.draw }));
      checkDraw.set(withDelay(Tick.checkDelay, withTiming(1, { duration: Tick.check, easing: Ease.draw })));
      quiet.set(withDelay(Tick.settleDelay, withTiming(1, { duration: Tick.settle })));
      flash.set(withDelay(Tick.settleDelay, withTiming(0, { duration: Tick.settle })));
      return;
    }
    if (was) {
      // Un-done: no ceremony. The done mark dissolves fast and what is still standing — nothing on
      // a binary mark, the remaining acts on a group's — is simply there again. An accent unwind
      // from full would be a bright reverse-ceremony saying nothing.
      checkDraw.set(0);
      flash.set(1);
      quiet.set(withTiming(0, { duration: Duration.fast }));
      progress.set(withTiming(target, { duration: Duration.fast }));
      return;
    }
    // A part of the group moved and the group itself did not: the arc walks to its new length on
    // the seal's own sweep clock, so ticking one act reads as the same motion as sealing all of
    // them — just a shorter piece of it. No check, no flash, no haptic: nothing has been asserted
    // about the group yet.
    progress.set(withTiming(target, { duration: Tick.sweep, easing: Ease.draw }));
  }, [complete, target, settling, reduceMotion, progress, checkDraw, flash, quiet]);

  // Zero-length dashes with round caps can render as a stray dot, so each stroke hides
  // itself entirely until it has any length to show.
  const arcProps = useAnimatedProps(() => {
    const p = progress.get();
    return {
      strokeDashoffset: circumference * (1 - p),
      // `flash` alone would fade the arc out after every seal and leave a part-filled ring blank at
      // rest — the arc is the only channel that says *how far in*, so it also has to survive on its
      // own. `1 - quiet` is exactly that resting visibility: full while the ring is open or partly
      // filled, gone once the muted done layer has taken over. The two are the same curve through
      // the seal's cross-fade, so taking the larger changes nothing there and keeps the arc solid
      // through an undo, where `quiet` is still on its way down.
      opacity: p < 0.004 ? 0 : Math.max(flash.get(), 1 - quiet.get()),
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
