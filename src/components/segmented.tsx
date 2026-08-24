import { useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Spring } from '@/constants/motion';
import { DenseLabelScale, Elevation, Radius, Spacing } from '@/constants/theme';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
  /** Accessible name; defaults to the label. */
  accessibilityLabel?: string;
};

// The track's inner inset and the gap between segments — one value, so the thumb's
// travel math stays in lockstep with the flex layout it shadows.
const PAD = Spacing.half;
const GAP = Spacing.half;

/**
 * The app's one segmented control — an iOS-style recessed track with a raised "thumb" under the
 * selected segment, themed to the cards and accent. Every mutually-exclusive mode choice
 * (Settings' appearance, the editor's goal and repeat) uses this same shape, so a segmented
 * choice reads identically everywhere instead of two controls speaking two languages.
 *
 * The thumb is one shared surface that *slides* to the chosen segment (`Spring.settle`, the
 * app's landing spring) — the motion the `selection` haptic confirms, so touch and eye get the
 * same event. It lands instantly on first layout (no mount travel) and under Reduce Motion.
 *
 * In this palette a raised surface is always the lighter tone (cards lift off the page), so the
 * thumb is `backgroundElement` in light / `backgroundSelected` in dark, sitting on the tone just
 * beneath it — with the tight `Elevation.thumb` lift. The one accent touch is the selected
 * segment's icon + label.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const isDark = useEffectiveScheme() === 'dark';
  const reduceMotion = useReducedMotion();

  const trackColor = isDark ? theme.backgroundElement : theme.backgroundSelected;
  const thumbColor = isDark ? theme.backgroundSelected : theme.backgroundElement;

  const [trackWidth, setTrackWidth] = useState(0);
  const count = options.length;
  const segmentWidth = trackWidth > 0 && count > 0 ? (trackWidth - PAD * 2 - GAP * (count - 1)) / count : 0;
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const targetX = PAD + index * (segmentWidth + GAP);

  // The thumb's left edge. Springs between segments on a value change; jumps when the
  // geometry itself changes (first measure, rotation) or under Reduce Motion. A LAYOUT effect:
  // `x` was initialised while the track was unmeasured (targetX ≈ the left edge), and the
  // remeasure jump must land before the thumb's first paint — a passive effect runs after it,
  // flashing a selected index > 0 at the wrong slot for one frame.
  const x = useSharedValue(targetX);
  const prevSegmentWidth = useRef(0);
  useLayoutEffect(() => {
    if (segmentWidth <= 0) return;
    const remeasured = prevSegmentWidth.current !== segmentWidth;
    prevSegmentWidth.current = segmentWidth;
    if (remeasured || reduceMotion) x.set(targetX);
    else x.set(withSpring(targetX, Spring.settle));
  }, [targetX, segmentWidth, reduceMotion, x]);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: trackColor, borderColor: theme.border }, style]}>
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { width: segmentWidth, backgroundColor: thumbColor }, thumbStyle]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            onPress={() => {
              if (option.value === value) return;
              haptics.selection();
              onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            android_ripple={{ color: theme.backgroundSelected }}
            style={styles.segment}>
            {option.icon ? (
              <AppIcon name={option.icon} size={16} color={selected ? theme.accent : theme.textSecondary} />
            ) : null}
            {/* A segment is a fixed slice of the track's width, so its label cannot be allowed to
                grow past it: the Progress period selector holds FOUR of these ("Week / Month /
                Year / Lifetime"), which at large accessibility text sizes pushed "Lifetime" out of
                its slot. `DenseLabelScale` is the cap the theme keeps for exactly this — a label
                in a fixed-size composition — and the clamp is the floor under it. */}
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              maxFontSizeMultiplier={DenseLabelScale}
              style={{ color: selected ? theme.accent : theme.textSecondary }}>
              {option.label}
            </ThemedText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PAD,
    gap: GAP,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 44,
    paddingVertical: Spacing.two + Spacing.half,
    // Concentric with the track: its radius minus the inset the thumb sits in, so the thumb's
    // corners run parallel to the track's rather than bowing a touch tighter inside them.
    borderRadius: Radius.card - PAD,
  },
  // The one raised surface the segments share — slid, never re-parented, so the lift is
  // continuous. Inset vertically by the track padding; horizontal travel is `translateX`.
  thumb: {
    ...Elevation.thumb,
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    // Concentric with the track: its radius minus the inset the thumb sits in, so the thumb's
    // corners run parallel to the track's rather than bowing a touch tighter inside them.
    borderRadius: Radius.card - PAD,
  },
});
