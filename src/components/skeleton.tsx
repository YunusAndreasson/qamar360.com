import Animated, { useReducedMotion, type CSSAnimationKeyframes } from 'react-native-reanimated';

import { Duration } from '@/constants/motion';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** The block's height. Required: a skeleton stands for something specific, and a default would
   *  be a guess at the shape of whatever it is holding the place of. */
  height: number;
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
export function Skeleton({ height }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      // Decorative only — a screen reader announces the real content once it loads.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        // `Radius.card`, always: every skeleton in the app holds the place of a card or a row
        // inside one, so the corner it draws is the corner the real thing will have.
        { width: '100%', height, borderRadius: Radius.card, backgroundColor: theme.backgroundElement },
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
