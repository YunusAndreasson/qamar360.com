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
 * The Progress screen's entrance clock — start OFFSETS (ms from screen appear), not durations.
 * One cascade so the three cards read in order (orbit → moons → year arc) instead of all firing
 * at once: the grid's wave begins as the orbit establishes, its last moon settles
 * (~grid + 29 stagger-steps + slow ≈ 880ms) just as the orbit lands (`Duration.orbit`), and the
 * year line draws on last, into a settled page. Total lead stays ≤ 320ms — a reading order, not
 * staged theater. `hero` is 0 and deliberately unwrapped at its site: the orbit re-animates on
 * live rate changes (refetch), and a delay must never contaminate those. Tune here, never inline.
 */
export const PageEnter = { hero: 0, grid: 160, year: 320 } as const;

/**
 * A stack card collapsing shut once its group is sealed. `duration` is the app's layout-
 * transition idiom (`slow`, monotonic — a spring would overshoot the measured height and
 * reveal empty space below the last row). `lead` delays the auto-collapse until the
 * `StackCompleteFlash` has fully rested (`Tick.settleDelay + Tick.settle`), so the card
 * folds away *out of* the seal rather than stepping on it — the collapse rides the seal
 * haptic instead of adding its own. Manual expand/collapse uses no lead.
 */
export const Collapse = { duration: Duration.slow, lead: Tick.settleDelay + Tick.settle } as const;
