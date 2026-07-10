import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Duration, Spring } from '@/constants/motion';

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Play the spring-in on mount. When false the wrapper is inert (born at full size) — so every
   *  routine card can wear the wrapper, but only the one just merged actually animates. */
  active?: boolean;
};

/** The card starts a touch small and springs up to full size — the "two rows becoming one" beat. */
const START_SCALE = 0.96;

/**
 * A mount animation for a freshly created routine card: it fades in and gently springs up to full
 * size, so two habits dropped onto each other visibly *coalesce* into one card instead of snapping
 * into existence. Paired with the drag ghost melting into the target, this reads as a merge.
 *
 * Every stack card wraps in one (a stable wrapper avoids remount churn), but only the card whose
 * merge just happened passes `active` — the rest are born at rest, so a cold load / day switch does
 * NOT spring every card in.
 *
 * Shared-value driven for the same reason as {@link FadeInView} — the `entering={FadeIn}` preset
 * sticks at opacity 0 under Fabric's view-flattening. Opacity and scale are born at their start
 * values, so the card's very first painted frame is already mid-animation (no one-frame flash at
 * full size). Honours Reduce Motion (jumps straight to the rest state).
 */
export function CoalesceIn({ children, style, active = true }: Props) {
  const reduceMotion = useReducedMotion();
  const animate = active && !reduceMotion;
  const opacity = useSharedValue(animate ? 0 : 1);
  const scale = useSharedValue(animate ? START_SCALE : 1);

  useEffect(() => {
    if (!animate) {
      opacity.set(1);
      scale.set(1);
      return;
    }
    opacity.set(withTiming(1, { duration: Duration.base, easing: Easing.out(Easing.quad) }));
    scale.set(withSpring(1, Spring.settle));
  }, [animate, opacity, scale]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));

  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
