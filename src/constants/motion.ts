/**
 * The app's motion vocabulary — defined once so every animation shares the same
 * feel and is tuned in a single place (mirrors how `theme.ts` owns colour).
 *
 * Springs use Reanimated's perceptual form (`duration` + `dampingRatio`) rather
 * than hand-tuned `damping/stiffness/mass`: `dampingRatio` 1 is critically damped
 * (no overshoot), `< 1` adds a measured bit of life. This reads more predictably
 * and is far easier to keep consistent than physics constants.
 */
import type { WithSpringConfig } from 'react-native-reanimated';

export const Spring = {
  /** Press in/out — snappy, no overshoot. */
  press: { duration: 140, dampingRatio: 1 },
  /** Settle back to rest with a hint of life. */
  settle: { duration: 280, dampingRatio: 0.9 },
  /** A restrained confirmation overshoot — the habit check "pop". */
  confirm: { duration: 380, dampingRatio: 0.62 },
} satisfies Record<string, WithSpringConfig>;

/** Timing durations (ms) for fades and layout transitions. `orbit` is the Progress
 *  screen's signature ring sweep — slower and more deliberate than a UI transition. */
export const Duration = { fast: 140, base: 200, slow: 320, orbit: 900 } as const;

/** Scale targets. `press`/`glyph` shrink on touch; `pop` is the check confirmation. */
export const Scale = { press: 0.97, glyph: 0.92, pop: 1.12 } as const;

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
 * A stack card collapsing shut once its group is sealed. `duration` is the app's layout-
 * transition idiom (`slow`, monotonic — a spring would overshoot the measured height and
 * reveal empty space below the last row). `lead` delays the auto-collapse until the
 * `StackCompleteFlash` has fully rested (`Tick.settleDelay + Tick.settle`), so the card
 * folds away *out of* the seal rather than stepping on it — the collapse rides the seal
 * haptic instead of adding its own. Manual expand/collapse uses no lead.
 */
export const Collapse = { duration: Duration.slow, lead: Tick.settleDelay + Tick.settle } as const;
