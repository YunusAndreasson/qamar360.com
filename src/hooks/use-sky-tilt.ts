import {
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { Parallax } from '@/constants/motion';

/** A normalized tilt offset in [-1, 1] per axis. A drifting sky layer multiplies these by its
 *  own `Parallax.depth` factor × `Parallax.maxShift` to get its pixel translation. */
export type SkyTilt = { shiftX: SharedValue<number>; shiftY: SharedValue<number> };

/**
 * The sky's tilt drift — read the phone's gravity vector and turn it into a tiny, smoothed,
 * self-centring offset for the night field. Gravity (not the raw gyroscope) because it's
 * drift-free and directly encodes how the phone is tilted; a slow baseline EMA makes "however
 * you're holding it right now" the centre, so the sky responds to *movement* and settles back
 * rather than hanging off-centre when you lie down or lay the phone flat. The output is spring-
 * smoothed (critically damped — no jitter, no overshoot), so it's felt, never noticed.
 *
 * All UI-thread: one sensor + four shared values, no React re-renders. Under Reduce Motion the
 * offsets pin to 0 (a still sky); when the device has no usable sensor (e.g. an emulator) gravity
 * reads as zeros and the offsets stay ~0 — a graceful no-op. Call once, high in the sky tree.
 */
export function useSkyTilt(): SkyTilt {
  const reduceMotion = useReducedMotion();
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: Parallax.interval });

  const shiftX = useSharedValue(0);
  const shiftY = useSharedValue(0);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);

  useAnimatedReaction(
    () => gravity.sensor.get(),
    (g) => {
      'worklet';
      if (reduceMotion || !g) {
        shiftX.set(0);
        shiftY.set(0);
        return;
      }
      const mag = Math.max(1e-3, Math.hypot(g.x, g.y, g.z));
      const nx = g.x / mag;
      const ny = g.y / mag;
      // Slow baseline follows the resting orientation, so shift = how far you've tilted *from* it.
      baseX.set(baseX.get() + (nx - baseX.get()) * Parallax.recenter);
      baseY.set(baseY.get() + (ny - baseY.get()) * Parallax.recenter);
      const dx = Math.min(1, Math.max(-1, (nx - baseX.get()) / Parallax.range));
      const dy = Math.min(1, Math.max(-1, (ny - baseY.get()) / Parallax.range));
      shiftX.set(withSpring(dx, Parallax.spring));
      shiftY.set(withSpring(dy, Parallax.spring));
    },
    [reduceMotion],
  );

  return { shiftX, shiftY };
}
