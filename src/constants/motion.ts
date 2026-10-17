/**
 * The app's motion vocabulary — defined once so every animation shares the same
 * feel and is tuned in a single place (mirrors how `theme.ts` owns colour).
 *
 * Springs use Reanimated's perceptual form (`duration` + `dampingRatio`) rather
 * than hand-tuned `damping/stiffness/mass`: `dampingRatio` 1 is critically damped
 * (no overshoot), `< 1` adds a measured bit of life. This reads more predictably
 * and is far easier to keep consistent than physics constants.
 */
import { Easing, type WithSpringConfig } from 'react-native-reanimated';

export const Spring = {
  /** Press in/out — snappy, no overshoot. */
  press: { duration: 140, dampingRatio: 1 },
  /** Settle back to rest with a hint of life. */
  settle: { duration: 280, dampingRatio: 0.9 },
  /** A restrained confirmation overshoot — the habit check "pop". */
  confirm: { duration: 380, dampingRatio: 0.62 },
} satisfies Record<string, WithSpringConfig>;

/**
 * Timing curves, named by what the motion is doing rather than by the maths. `draw` is a mark
 * travelling to its value (a ring sweeping shut, a chart line drawing on) — fast out of the gate,
 * landing softly; `enter` is something arriving (a fade-in, the celebration card rising); `settle`
 * is a symmetric change of state (a fold opening, a flash cross-fading to rest); `pass` is a light
 * crossing and leaving (the orbit's glint); `breathe` is one half-cycle of an ambient loop.
 * Tune here, never inline.
 */
export const Ease = {
  draw: Easing.out(Easing.cubic),
  enter: Easing.out(Easing.quad),
  settle: Easing.inOut(Easing.quad),
  pass: Easing.inOut(Easing.cubic),
  breathe: Easing.inOut(Easing.sin),
} as const;

/** Timing durations (ms) for fades and layout transitions. `orbit` is the Progress
 *  screen's signature ring sweep — slower and more deliberate than a UI transition;
 *  `tally` is a number counting up to its value (the celebration degrees readout);
 *  `pulse` is one half-cycle of a skeleton shimmer; `breath` one half-cycle of the
 *  hero moon's ambient breathing — the two repeating loops, named so the app's only
 *  infinite animations stay part of the vocabulary. */
export const Duration = { fast: 140, base: 200, slow: 320, tally: 600, orbit: 900, pulse: 800, breath: 4200 } as const;

/** Scale targets. `press`/`glyph` shrink on touch; `pop` is the check confirmation;
 *  `enter` is where an arriving surface starts before settling to 1 (a new stack card
 *  coalescing, the celebration card rising). */
export const Scale = { press: 0.97, glyph: 0.92, pop: 1.12, enter: 0.96 } as const;

/**
 * The tick — the habit check's choreography, on one clock (ms from the tap) so the ring
 * animation and the day-complete haptic stay in step:
 *
 *   0 ───────── sweep ──┐                       the accent arc sweeps the ring shut
 *          checkDelay ──┼── check ──┐           the checkmark draws in (overlapping the
 *                       │           │           sweep's landing, so the two read as one motion)
 *                       │           settleDelay ── settle    the flash cross-fades to the
 *                       │                                    quiet done tone — lights, then rests
 *
 * `haptics.celebrate` times its full-moon tail beat to `sweep`, landing the weighty pulse
 * exactly as the ring closes. Tune here, never inline — the blend depends on the shared clock.
 */
export const Tick = {
  sweep: 220,
  checkDelay: 180,
  check: 200,
  settleDelay: 440,
  settle: 240,
} as const;

/**
 * A stats page's entrance clock — start OFFSETS (ms from screen appear), not durations. One cascade
 * so a screen's cards read in order instead of all firing at once: Progress runs `first` (the month
 * orbit sweeps) then `second` (the Over-time line draws on, into a page that has already
 * established); Habits → Stats runs all three (ring, weekday bars, trend line).
 *
 * `first` is 0 and deliberately unwrapped at its site: a hero re-animates on live rate changes
 * (refetch), and a delay must never contaminate those. Total lead stays ≤ 320ms — a reading order,
 * not staged theater. Positional rather than named after any one card, so deleting a card can't
 * leave the ladder describing something that is no longer there. Tune here, never inline.
 */
export const PageEnter = { first: 0, second: 160, third: 320 } as const;

/**
 * A stack card collapsing shut once its group is sealed. `duration` is the app's layout-
 * transition idiom (`slow`, monotonic — a spring would overshoot the measured height and
 * reveal empty space below the last row). `lead` delays the auto-collapse until the
 * `StackCompleteFlash` has fully rested (`Tick.settleDelay + Tick.settle`), so the card
 * folds away *out of* the seal rather than stepping on it — the collapse rides the seal
 * haptic instead of adding its own. Manual expand/collapse uses no lead.
 */
export const Collapse = { duration: Duration.slow, lead: Tick.settleDelay + Tick.settle } as const;

/**
 * The sky's breathing — the starfield's three layers dim and re-brighten on slow half-cycles
 * (near-primes, mutually incommensurate, so the combined shimmer never reads as a repeating
 * pattern). `half` follows the `Duration.breath` convention: one `withTiming` half-cycle,
 * auto-reversed by `withRepeat(-1, true)`. `floor` is the dimmest a layer ever gets (× its
 * base opacity) — stars soften, they never wink out.
 */
export const Twinkle = { half: [7000, 11000, 17000], floor: 0.7 } as const;

/**
 * The sky's parallax — the whole night field drifts a few pixels as the phone tilts, read from
 * the gravity vector (drift-free, works in any holding posture). Deliberately a *whisper*: felt,
 * not noticed — a real sky that breathes when you move, never a toy.
 *
 * - `maxShift` px at full tilt, before each layer's `depth` multiplier; `depth` spreads the
 *   layers front-to-back (far glow barely moves, near dust moves most) so the field reads with a
 *   hint of dimension rather than as one flat plane. Stars are ~at infinity, so the spread is
 *   slight by design.
 * - `range` is the gravity-unit tilt (‖·‖ of the normalized gravity delta) that maps to the full
 *   shift; larger = you must tilt further for the same drift.
 * - `recenter` is a slow baseline EMA: "however you're holding it now" becomes centre, so the sky
 *   settles back after a movement instead of hanging off to one side when you lie down. It is
 *   per *sample*, so it is tuned WITH `interval` — the pair sets a ~2.5 s recentring time
 *   constant, and changing one without the other changes how fast the sky settles.
 * - `spring` is critically damped (no overshoot, no jitter); `interval` samples the sensor at
 *   20 Hz — `GRAVITY` is CoreMotion device-motion, i.e. the gyroscope and its fusion, one of the
 *   hungriest things on the phone, and every sample is a main-thread callback. After a 700 ms
 *   spring nobody can tell 20 Hz from 30. `overscan` is the negative-inset margin each drifting
 *   layer carries so a shift never exposes the field's clip edge.
 * - `deadzone` is how far the smoothed target must move before the spring is re-issued, in the
 *   same normalized units as the shift (0.01 ≈ 0.2 px at `maxShift`, comfortably sub-pixel).
 *   Without it a 700 ms spring restarted on every sample can never converge, so a phone lying
 *   perfectly still keeps the UI thread's frame loop awake for as long as the app is open.
 */
export const Parallax = {
  maxShift: 16,
  range: 0.35,
  interval: 50,
  recenter: 0.03,
  deadzone: 0.01,
  overscan: 28,
  spring: { duration: 700, dampingRatio: 1 },
  // Front-to-back drift factors: the far overhead glow and corner bloom barely move, the bright
  // anchors (the stars you orient by) move a little, and the three breathing "dust" layers move
  // most — each a touch differently, so the field reads with real depth instead of one flat pane.
  depth: { glow: 0.2, bloom: 0.35, bright: 0.7, dust: [1.0, 1.15, 1.3] },
} as const;

/**
 * A meteor — one faint hairline streak across the upper sky, then a long randomized wait. The
 * highest toy-risk element in the app, so tuned to be genuinely rare and barely-there: the read
 * is "was that a shooting star? …I think so", never an effect. `gap` is the [min, max] ms wait
 * between streaks (2.5–6 min); `travel` is how long one streak takes to cross and fade (ms).
 * Suppressed entirely under Reduce Motion.
 */
export const Meteor = { gap: [150000, 360000], travel: 700 } as const;
