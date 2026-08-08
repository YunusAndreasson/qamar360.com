import { useEffect, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { RowTrailingButton } from '@/components/row-trailing-button';
import { Collapse } from '@/constants/motion';

import type { ReactNode } from 'react';

/**
 * The disclosure the stack card wears — the one thing on Today with content worth hiding.
 *
 * It dressed the exchange and habit rows too, for a while, for the symmetry. That was the wrong
 * kind of consistency: a stack's chevron opens onto its sequence, while a loose row's opened onto a
 * two-word schedule and a menu door — one signifier, two very different payoffs, which is how a
 * disclosure stops being trusted. Those rows carry a `⋯` instead (`RowOptionsButton`), and the
 * chevron now means one thing: **there is more of this to read.**
 */

/**
 * The disclosure chevron. Geometry, target and press behaviour come from {@link RowTrailingButton},
 * shared with the `⋯` so the two can't drift; what belongs to the fold is the glyph **swap** (never
 * a rotation — the house idiom, see `expandable-add-row.tsx`) and the `expanded` state it publishes.
 */
export function FoldToggle({
  expanded,
  onPress,
  label,
  hint,
}: {
  expanded: boolean;
  onPress: () => void;
  /** A STABLE name for what the fold hides ("Fajr acts"). `expanded` already says which way it
   *  goes; a label that flipped too would announce the state twice. */
  label: string;
  hint: string;
}) {
  return (
    <RowTrailingButton
      icon={expanded ? 'expandLess' : 'expandMore'}
      expanded={expanded}
      label={label}
      hint={hint}
      onPress={onPress}
    />
  );
}

/**
 * The body that folds shut: an overflow-clipped wrapper whose height and opacity ride a `progress`
 * value between the measured content height and 0. The bar stays OUTSIDE this, so it is always
 * tappable.
 *
 * The animation contract, learned the hard way and not to be re-litigated:
 *
 * - The height is applied **unconditionally, from the first frame** — never a style that comes and
 *   goes. Reanimated keeps the last value a style stops setting, so a height that disappeared would
 *   strand the body at its folded 0.
 * - The body stays **mounted while folded**, and — this is the load-bearing part — it is measured
 *   from an **absolutely positioned** node. A folded clip is 0 tall, and on this RN version an
 *   in-flow child of it measures **0 too**, so a fold that seeds `contentH` from an in-flow
 *   `onLayout` can never open: height stays 0 × 0, the children never get a box, and no second
 *   layout ever comes to correct it. Out of flow, the content is laid out against the clip's width
 *   alone and always reports its true height, so the very first unfold animates to the right place.
 *   (The stack card survived this for a while by accident: its `contentStyle` padding made the
 *   measurement 8 instead of 0, which was enough to bootstrap a second, correct layout pass. The
 *   exchange row, with no padding, measured a clean 0 and stayed shut — which is how this was
 *   found.)
 * - Before the first layout `contentH` is 0 and the card is folded, so 0 × 0 = 0 is already the
 *   correct paint — no mount flash, and no "unclipped until measured" special case.
 * - A mounted, laid-out, invisible body is still in the hit test and the a11y tree, so both are
 *   turned off by hand. (Skipping this once left every collapsed card's rows reachable by TalkBack.)
 * - It is born **at rest** at its current state, so a drag ghost cloned mid-gesture doesn't animate
 *   open on lift.
 */
export function Fold({
  expanded,
  contentStyle,
  children,
}: {
  expanded: boolean;
  /** Applied to the measured content node — so any padding it adds is inside `contentH`. */
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(expanded ? 1 : 0);
  const contentH = useSharedValue(0);
  const firstRun = useRef(true);

  useEffect(() => {
    const target = expanded ? 1 : 0;
    if (firstRun.current) {
      firstRun.current = false;
      progress.set(target);
      return;
    }
    if (reduceMotion) {
      progress.set(target);
      return;
    }
    progress.set(withTiming(target, { duration: Collapse.duration, easing: Easing.inOut(Easing.quad) }));
  }, [expanded, reduceMotion, progress]);

  const bodyStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return { height: p * contentH.get(), opacity: p };
  });

  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) contentH.set(h);
  };

  return (
    <Animated.View
      style={[styles.clip, bodyStyle]}
      pointerEvents={expanded ? 'auto' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>
      <View onLayout={onContentLayout} style={[styles.content, contentStyle]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Clips the body as it folds shut. Its height IS the animation, so it can carry no content of
  // its own — the body hangs inside it, out of flow.
  clip: { overflow: 'hidden' },
  // Out of flow (see the doc): pinned to the clip's top and both edges, so it takes the card's
  // width but none of its height, and measures its true content height even while the clip is 0.
  content: { position: 'absolute', top: 0, left: 0, right: 0 },
});
