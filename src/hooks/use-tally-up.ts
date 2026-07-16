import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * A number counting up to `target` over `durationMs` — a JS rAF ramp with ease-out-cubic, the
 * same curve as the orbit sweep, so a readout tallied over `Duration.orbit` lands on the same
 * frame as the arc (and the celebration readout keeps its `Duration.tally` ramp). When `target`
 * changes mid-life (a refetch), the count resumes from the currently shown value — the number
 * nudges to the new reading instead of re-counting from zero. Reduce Motion shows `target`
 * directly. Isolate the consuming text in its own component: the ramp re-renders it at ~60fps
 * and SVG siblings shouldn't come along for the ride.
 */
export function useTallyUp(target: number, durationMs: number): number {
  const reduceMotion = useReducedMotion();
  // The animated value. Reduce Motion renders `target` directly (derived below), so state is
  // only ever driven for the animated path — no synchronous setState-in-effect otherwise.
  const [animated, setAnimated] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    if (reduceMotion) return; // reduced motion renders `target` directly (see `shown`)
    const from = shownRef.current;
    if (from === target) return; // already resting on the value — nothing to ramp
    let raf = requestAnimationFrame(step);
    let start: number | null = null;
    function step(ts: number) {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(from + (target - from) * eased);
      shownRef.current = value;
      setAnimated(value);
      if (p < 1) raf = requestAnimationFrame(step);
    }
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduceMotion]);

  return reduceMotion ? target : animated;
}
