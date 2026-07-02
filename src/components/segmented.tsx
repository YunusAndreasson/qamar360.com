import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
  /** Accessible name; defaults to the label. */
  accessibilityLabel?: string;
};

/**
 * The app's one segmented control — an iOS-style recessed track with a raised "thumb" on the
 * selected segment, themed to the cards and accent. Every mutually-exclusive mode choice
 * (Settings' appearance, the editor's goal and repeat) uses this same shape, so a segmented
 * choice reads identically everywhere instead of two controls speaking two languages.
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

  const trackColor = isDark ? theme.backgroundElement : theme.backgroundSelected;
  const thumbColor = isDark ? theme.backgroundSelected : theme.backgroundElement;

  return (
    <View style={[styles.track, { backgroundColor: trackColor, borderColor: theme.border }, style]}>
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
            style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: thumbColor }]]}>
            {option.icon ? (
              <AppIcon name={option.icon} size={16} color={selected ? theme.accent : theme.textSecondary} />
            ) : null}
            <ThemedText type="smallBold" style={{ color: selected ? theme.accent : theme.textSecondary }}>
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
    padding: Spacing.half,
    gap: Spacing.half,
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
    borderRadius: Radius.control + Spacing.half,
  },
  segmentSelected: Elevation.thumb,
});
