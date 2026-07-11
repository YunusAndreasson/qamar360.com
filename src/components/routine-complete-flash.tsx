import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Tick } from '@/constants/motion';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The border flash a routine card gives the instant its last open act is ticked — the whole group
 * sealed. It reuses the drag "drop ring" shape (a 2px border overlaying the card's rounded rect),
 * but in the warm `complete` tone — the same colour the completing habit's ring settles into — and
 * as a one-shot bloom-and-fade rather than the drag ring's hover cross-fade.
 *
 * The bloom is on the shared `Tick` clock (constants/motion), so it reads as one motion with the
 * completing tick: the border lights to full as the last habit's ring sweeps shut (`Tick.sweep`),
 * holds through the check draw, then cross-fades out on the ring's own settle window — it lights,
 * then rests. That same `Tick.sweep` is when `haptics.routineComplete`'s tail beat lands, so the
 * flash and the buzz hit together. The haptic lives in use-habits (one source of truth), so this
 * layer is purely visual and never buzzes. Reduce Motion: no flash — every row already showing its
 * done mark says the group is finished.
 */
export function RoutineCompleteFlash({ complete }: { complete: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const flash = useSharedValue(0);

  // Fire only on the false→true edge — the moment of sealing — mirroring CompletionRing's
  // `wasComplete` guard: a card that loads already-complete, or re-renders while still complete,
  // never flashes. Born at `complete` so the first run is a no-op for an already-sealed routine.
  const wasComplete = useRef(complete);
  useEffect(() => {
    const was = wasComplete.current;
    wasComplete.current = complete;
    if (reduceMotion || !complete || was) return;
    flash.set(
      withSequence(
        // Bloom to full as the last ring closes and the haptic tail lands.
        withTiming(1, { duration: Tick.sweep, easing: Easing.out(Easing.cubic) }),
        // Hold through the check draw, then fade out on the ring's settle — lights, then rests.
        withDelay(Tick.settleDelay - Tick.sweep, withTiming(0, { duration: Tick.settle, easing: Easing.inOut(Easing.quad) })),
      ),
    );
  }, [complete, reduceMotion, flash]);

  const style = useAnimatedStyle(() => ({ opacity: flash.get() }));

  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: theme.complete }, style]} />;
}

const styles = StyleSheet.create({
  // Overlays the whole card at its rounded rect — a sibling of the Surface, outside its content
  // clip, so the 2px border isn't cut off (the same shape the drag DropRing uses).
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: Radius.card,
  },
});
