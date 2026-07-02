import Animated, { useReducedMotion } from 'react-native-reanimated';

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
 * A mount fade-in driven by Reanimated's CSS animations API (`animationName` keyframes), NOT the
 * `entering={FadeIn}` layout-animation preset.
 *
 * On the New Architecture those presets rely on a `nativeID` that Fabric's view-flattening
 * clobbers, so the view stays stuck at opacity 0 (it never appears) — and, being layout
 * animations, they also get reparented into the navigator's transition overlay mid-push, which
 * is what made Discover's cards "fly over the header". The CSS API is Reanimated 4's
 * Fabric-native declarative path: keyframes are applied like style props on the UI thread, with
 * no nativeID dependency and no reparenting. Its failure mode is also safe — keyframes only hold
 * while the animation runs, so if it ever didn't, the view renders at its base opacity (visible)
 * rather than stuck hidden. Honours Reduce Motion.
 */
export function FadeInView({ children, style, duration = Duration.base, delay = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      style={[
        style,
        // Under Reduce Motion the view simply renders in place, fully shown (substitute, don't soften).
        reduceMotion
          ? null
          : {
              animationName: { from: { opacity: 0 } },
              animationDuration: duration,
              animationDelay: delay,
              // Hold the pre-fade opacity through a stagger delay — without a backwards fill the
              // view would mount fully shown, then blink to 0 when the delayed animation starts.
              animationFillMode: 'backwards',
              // Matches withTiming's default in-out easing, keeping the fade's feel unchanged.
              animationTimingFunction: 'ease-in-out',
            },
      ]}>
      {children}
    </Animated.View>
  );
}
