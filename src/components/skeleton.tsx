import Animated, { useReducedMotion, type CSSAnimationKeyframes } from 'react-native-reanimated';

import { Duration } from '@/constants/motion';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  height?: number;
  radius?: number;
};

/** The breathing fade as a declarative CSS animation (Reanimated 4): the library owns the
 *  infinite loop — no shared value, effect, or cleanup to hand-roll. The base style carries
 *  the `from` opacity, so the first frame is already correct (this is a loop starting at
 *  rest, not a mount fade — the FadeInView first-frame concern doesn't apply). */
const pulse: CSSAnimationKeyframes = {
  from: { opacity: 0.4 },
  to: { opacity: 0.8 },
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

  return (
    <Animated.View
      // Decorative only — a screen reader announces the real content once it loads.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: '100%', height, borderRadius: radius, backgroundColor: theme.backgroundElement },
        reduceMotion
          ? { opacity: 0.8 } // the pulse's resting brightness, held still
          : {
              opacity: 0.4,
              animationName: pulse,
              animationDuration: Duration.pulse,
              animationIterationCount: 'infinite',
              animationDirection: 'alternate',
              animationTimingFunction: 'ease-in-out',
            },
      ]}
    />
  );
}
