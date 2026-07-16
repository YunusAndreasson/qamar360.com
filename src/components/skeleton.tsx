import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Duration } from '@/constants/motion';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  height?: number;
  radius?: number;
};

/**
 * A single placeholder block for loading states — a calm opacity pulse on the card
 * tone, never a spinner. Skeletons let a screen show its *shape* immediately (Today's
 * rows, Progress's hero + grid) so the wait reads as "almost there"
 * rather than "nothing yet" — the Linear/Notion default. The pulse is dropped under
 * Reduce Motion (the muted block alone still says "loading"; HIG: substitute, don't soften).
 */
export function Skeleton({ height = 16, radius = Radius.control }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      pulse.set(1);
      return;
    }
    // 0 → 1 → 0 … a slow breathing fade; `true` auto-reverses each cycle.
    pulse.set(withRepeat(withTiming(1, { duration: Duration.pulse }), -1, true));
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: 0.4 + pulse.get() * 0.4 }));

  return (
    <Animated.View
      // Decorative only — a screen reader announces the real content once it loads.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: '100%', height, borderRadius: radius, backgroundColor: theme.backgroundElement }, animatedStyle]}
    />
  );
}
