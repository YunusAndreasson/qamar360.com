import { useEffect, useRef } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { Scale, Spring } from '@/constants/motion';

/**
 * The app's one confirmation "pop" — a restrained spring overshoot when `active` flips true
 * (a habit ticked, a Discover row added), springing quietly back to rest when it flips false.
 * Returns the animated style for the mark's container; one hook so every screen's "yes"
 * moment shares the exact same physics.
 *
 * The very first run is skipped, so content that loads already-active doesn't pop on mount —
 * only a genuine toggle does. Under Reduce Motion the mark's colour/shape change already
 * conveys the state, so the scale is dropped entirely rather than merely shrunk
 * (HIG: substitute, don't soften).
 */
export function useConfirmPop(active: boolean) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reduceMotion) {
      scale.set(1);
      return;
    }
    scale.set(
      active
        ? withSequence(withSpring(Scale.pop, Spring.confirm), withSpring(1, Spring.settle))
        : withSpring(1, Spring.settle),
    );
  }, [active, scale, reduceMotion]);

  return useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
}
