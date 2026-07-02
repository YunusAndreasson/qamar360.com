import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A single placeholder block for loading states — a calm opacity pulse on the card
 * tone, never a spinner. Skeletons let a screen show its *shape* immediately (Today's
 * rows, Progress's hero + grid) so the wait reads as "almost there"
 * rather than "nothing yet" — the Linear/Notion default. The pulse is dropped under
 * Reduce Motion (the muted block alone still says "loading"; HIG: substitute, don't soften).
 */
export function Skeleton({ width = '100%', height = 16, radius = Radius.control, style }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      pulse.set(1);
      return;
    }
    // 0 → 1 → 0 … a slow breathing fade; `true` auto-reverses each cycle.
    pulse.set(withRepeat(withTiming(1, { duration: 800 }), -1, true));
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: 0.4 + pulse.get() * 0.4 }));

  return (
    <Animated.View
      // Decorative only — a screen reader announces the real content once it loads.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.backgroundElement }, animatedStyle, style]}
    />
  );
}
