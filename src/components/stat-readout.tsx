import { useEffect, useRef } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';

/**
 * The quiet reading line of a stat card — the Progress screen's shared "focused reading"
 * pattern (the month grid's day readout, the year chart's month readout), so every card
 * answers a tap in the same voice. Born at rest; a barely-there dip→rise (0.4 → 1) signals
 * the value refreshed whenever `refreshKey` changes. Reduce Motion swaps the text with no
 * fade — substitute, don't soften, the way the rest of the screen gates.
 */
export function StatReadout({ text, refreshKey }: { text: string; refreshKey: string | number }) {
  const reduceMotion = useReducedMotion();
  const fade = useSharedValue(1);
  const mounted = useRef(false);
  useEffect(() => {
    const isFirst = !mounted.current;
    mounted.current = true;
    if (reduceMotion) {
      fade.set(1);
      return;
    }
    if (isFirst) return; // born at rest — the dip marks a *refresh*, not the first paint
    fade.set(0.4);
    fade.set(withTiming(1, { duration: Duration.base, easing: Easing.inOut(Easing.quad) }));
  }, [refreshKey, reduceMotion, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));

  return (
    <Animated.View style={fadeStyle}>
      <ThemedText type="smallCompact" themeColor="textSecondary" numberOfLines={1}>
        {text}
      </ThemedText>
    </Animated.View>
  );
}
