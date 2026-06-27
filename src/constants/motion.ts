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
