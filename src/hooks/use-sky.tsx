import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Parallax, Twinkle } from '@/constants/motion';
import { useAppForeground } from '@/hooks/use-on-stage';
import { useSkyMotion } from '@/hooks/use-sky-motion';

import type { ReactNode } from 'react';

/** A normalized tilt offset in [-1, 1] per axis. A drifting sky layer multiplies these by its
 *  own `Parallax.depth` factor × `Parallax.maxShift` to get its pixel translation. */
export type SkyTilt = { shiftX: SharedValue<number>; shiftY: SharedValue<number> };

type SkyEngine = {
  tilt: SkyTilt;
  /** The three slow breath clocks the twinkle layers ride, one per {@link Twinkle.half}. */
  breath: SharedValue<number>[];
  /** Claim a breath clock for as long as a layer has stars to carry; returns its release. */
  claimTwinkle: () => () => void;
};

const SkyContext = createContext<SkyEngine | null>(null);

/**
 * The one night sky, for the whole app.
 *
 * Every screen that paints a sky used to run its own copy of this machinery, and under
 * `NativeTabs` all three tabs are mounted eagerly and never unmount — so the app opened three
 * gravity sensors and nine perpetual twinkle loops and kept them all running for its entire
 * lifetime, to show one sky at a time. Worse, each `useAnimatedSensor` allocates its own
 * `CMMotionManager` and starts device-motion updates onto the main queue, which Apple explicitly
 * warns against: `GRAVITY` means the full accelerometer/gyroscope fusion, and the phone was
 * running three of them at once. The engine therefore lives here, once, above the navigator, and
 * every sky reads the same shared values.
 *
 * Nothing runs that isn't being used:
 *
 *  - the sensor is *mounted*, not merely ignored, when the sky may move — so "Sky motion" off (or
 *    the system's Reduce Motion) actually stops the gyroscope rather than zeroing its output while
 *    still paying for it, which is what {@link useSkyMotion} used to buy;
 *  - both sensor and twinkle stop while the app is out of the foreground;
 *  - the twinkle clocks are ref-counted by their layers, so a daylight sky that has pruned every
 *    breathing tier leaves no loop running behind it.
 *
 * Individual screens gate their own per-frame work with {@link useOnStage}; this is the shared
 * source those gates read from.
 */
export function SkyProvider({ children }: { children: ReactNode }) {
  const shiftX = useSharedValue(0);
  const shiftY = useSharedValue(0);
  const breath0 = useSharedValue(0);
  const breath1 = useSharedValue(0);
  const breath2 = useSharedValue(0);
  const breath = useMemo(() => [breath0, breath1, breath2], [breath0, breath1, breath2]);

  const skyMotion = useSkyMotion();
  const foreground = useAppForeground();
  const running = skyMotion && foreground;

  // How many twinkle layers currently have stars. The count lives in a ref (effects from three
  // skies' worth of layers land in one commit; a state counter would render once per claim) and
  // only its zero/non-zero edge is published.
  const claims = useRef(0);
  const [claimed, setClaimed] = useState(false);
  const claimTwinkle = useCallback(() => {
    claims.current += 1;
    if (claims.current === 1) setClaimed(true);
    return () => {
      claims.current -= 1;
      if (claims.current === 0) setClaimed(false);
    };
  }, []);

  const twinkling = running && claimed;
  useEffect(() => {
    if (!twinkling) return;
    breath.forEach((value, i) =>
      value.set(
        withRepeat(withTiming(1, { duration: Twinkle.half[i]!, easing: Easing.inOut(Easing.sin) }), -1, true),
      ),
    );
    // Parked, not reset: the loops resume from wherever they had reached, so returning to the app
    // (or to a tier the daylight had pruned) never steps the field's brightness.
    return () => breath.forEach((value) => cancelAnimation(value));
  }, [twinkling, breath]);

  const value = useMemo(
    () => ({ tilt: { shiftX, shiftY }, breath, claimTwinkle }),
    [shiftX, shiftY, breath, claimTwinkle],
  );

  return (
    <SkyContext value={value}>
      {running ? <GravityDrive shiftX={shiftX} shiftY={shiftY} /> : null}
      {children}
    </SkyContext>
  );
}

/**
 * The sky's tilt drift — read the phone's gravity vector and turn it into a tiny, smoothed,
 * self-centring offset for the night field. Gravity (not the raw gyroscope) because it's
 * drift-free and directly encodes how the phone is tilted; a slow baseline EMA makes "however
 * you're holding it right now" the centre, so the sky responds to *movement* and settles back
 * rather than hanging off-centre when you lie down or lay the phone flat. The output is spring-
 * smoothed (critically damped — no jitter, no overshoot), so it's felt, never noticed.
 *
 * Renders nothing: it exists so the sensor's lifetime is a mount, which is the only way to
 * actually stop CoreMotion. When the device has no usable sensor (e.g. an emulator) gravity reads
 * as zeros and the offsets stay ~0 — a graceful no-op.
 */
function GravityDrive({ shiftX, shiftY }: SkyTilt) {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: Parallax.interval });
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  // The last target actually handed to a spring — what `deadzone` is measured against.
  const targetX = useSharedValue(0);
  const targetY = useSharedValue(0);

  useAnimatedReaction(
    () => gravity.sensor.get(),
    (g) => {
      'worklet';
      if (!g) return;
      const mag = Math.max(1e-3, Math.hypot(g.x, g.y, g.z));
      const nx = g.x / mag;
      const ny = g.y / mag;
      // A single non-finite sample would poison everything downstream: NaN flows through the
      // baseline EMA into `shiftX`/`shiftY`, every sky layer gets `translateX: NaN`, and a view
      // with a NaN transform is not drawn — so one bad read silently deletes the whole night
      // sky, permanently, with no error anywhere. Drop the sample and hold the last good offset.
      // (Emulators have no gravity sensor and read zeros, so this can only ever bite on device.)
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
      // Slow baseline follows the resting orientation, so shift = how far you've tilted *from* it.
      baseX.set(baseX.get() + (nx - baseX.get()) * Parallax.recenter);
      baseY.set(baseY.get() + (ny - baseY.get()) * Parallax.recenter);
      const dx = Math.min(1, Math.max(-1, (nx - baseX.get()) / Parallax.range));
      const dy = Math.min(1, Math.max(-1, (ny - baseY.get()) / Parallax.range));
      // Only re-issue a spring once the target has moved somewhere a pixel could follow. A 700 ms
      // spring restarted every sample never converges, and an animation that never converges keeps
      // the frame loop — and everything it drives, up to and including the blur behind the tab bar
      // — alive for as long as the app is open, on a phone lying still on a table. Below the
      // deadzone the spring already in flight is left alone to land and stop. The baseline keeps
      // easing underneath either way, so the drift measured against the last committed target
      // accumulates and the sky still returns to centre; it just arrives and then rests.
      if (Math.abs(dx - targetX.get()) > Parallax.deadzone) {
        targetX.set(dx);
        shiftX.set(withSpring(dx, Parallax.spring));
      }
      if (Math.abs(dy - targetY.get()) > Parallax.deadzone) {
        targetY.set(dy);
        shiftY.set(withSpring(dy, Parallax.spring));
      }
    },
  );

  // Hand the sky back to centre on the way out (Reduce Motion, "Sky motion" off, backgrounding)
  // rather than leaving it hanging at whatever tilt it held when the sensor stopped.
  useEffect(
    () => () => {
      shiftX.set(withSpring(0, Parallax.spring));
      shiftY.set(withSpring(0, Parallax.spring));
    },
    [shiftX, shiftY],
  );

  return null;
}

function useSky(): SkyEngine {
  const ctx = useContext(SkyContext);
  if (!ctx) throw new Error('useSky must be used within a SkyProvider');
  return ctx;
}

/** The shared tilt offsets every drifting sky layer rides. */
export function useSkyTilt(): SkyTilt {
  return useSky().tilt;
}

/**
 * One twinkle layer's breath clock. `wanted` is whether this layer currently has any stars to
 * carry — a daylight-pruned layer releases its claim, and when the last layer in the app lets go
 * the loops stop rather than running on behind an empty sky.
 */
export function useTwinkleBreath(index: number, wanted: boolean): SharedValue<number> {
  const { breath, claimTwinkle } = useSky();
  useEffect(() => (wanted ? claimTwinkle() : undefined), [wanted, claimTwinkle]);
  return breath[index]!;
}
