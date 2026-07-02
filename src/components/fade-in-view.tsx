import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Duration } from '@/constants/motion';

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Fade duration (ms). Defaults to the shared `base` timing. */
  duration?: number;
  /** Delay before the fade starts (ms) — for staggering a group. */
  delay?: number;
};

/**
 * A mount fade-in driven by a shared value, NOT the `entering={FadeIn}` layout-animation preset
 * and NOT the CSS animations API.
 *
 * `entering` presets rely on a `nativeID` that Fabric's view-flattening clobbers, so the view
 * stays stuck at opacity 0 — and, being layout animations, they get reparented into the
 * navigator's transition overlay mid-push ("cards flying over the header"). The CSS keyframes
 * route (`animationName: { from: { opacity: 0 } }`) fixes those but applies its first keyframe
 * only after the view has mounted, so the content paints fully visible for a frame, snaps to 0,
 * then fades — a visible text flicker on the Discover accordions. A shared value born at 0 is
 * the view's opacity on its very first frame, so no flash is possible; same proven pattern as
 * the month grid's staggered cells. Honours Reduce Motion.
 */
export function FadeInView({ children, style, duration = Duration.base, delay = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.set(1);
      return;
    }
    // Matches withTiming's default in-out easing, keeping the fade's feel unchanged.
    opacity.set(withDelay(delay, withTiming(1, { duration, easing: Easing.inOut(Easing.quad) })));
  }, [reduceMotion, opacity, delay, duration]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return <Animated.View style={[style, fade]}>{children}</Animated.View>;
}
