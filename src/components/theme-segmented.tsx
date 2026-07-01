import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { usePreferences, type ThemePreference } from '@/hooks/use-preferences';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Option = {
  value: ThemePreference;
  label: string;
  icon: IconName;
};

// Sun / moon / auto carry the meaning at a glance and tie the control to the app's
// lunar theme, so it reads as ours rather than a stock platform widget.
const OPTIONS: Option[] = [
  { value: 'system', label: 'System', icon: 'appearanceAuto' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

/**
 * Appearance selector — a custom three-segment control themed to match the app's
 * cards and accent. Replaces the platform `SegmentedControl`, which looked like a
 * foreign widget dropped into the settings list.
 */
export function ThemeSegmented() {
  const theme = useTheme();
  const { themePreference, setThemePreference } = usePreferences();
  const isDark = useEffectiveScheme() === 'dark';

  // An iOS-style segmented control: a recessed track with a raised "thumb" on the selected
  // segment. In this palette a raised surface is always the lighter tone (cards lift off the
  // page), so the thumb is `backgroundElement` in light / `backgroundSelected` in dark, sitting on
  // the tone just beneath it — and a tight shadow gives it lift in both modes. This keeps the
  // selected segment clearly visible on white (a same-as-card fill used to vanish there) while
  // still carrying the one accent touch on its icon + label.
  const trackColor = isDark ? theme.backgroundElement : theme.backgroundSelected;
  const thumbColor = isDark ? theme.backgroundSelected : theme.backgroundElement;

  return (
    <View style={[styles.track, { backgroundColor: trackColor, borderColor: theme.border }]}>
      {OPTIONS.map((option) => {
        const selected = option.value === themePreference;
        return (
          <PressableScale
            key={option.value}
            onPress={() => {
              if (option.value === themePreference) return;
              haptics.selection();
              setThemePreference(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} appearance`}
            android_ripple={{ color: theme.backgroundSelected }}
            // Selected reads as a raised thumb (the lighter card tone, lifted by a soft shadow)
            // carrying the one accent touch on its icon + label — not a saturated solid-accent block.
            style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: thumbColor }]]}>
            <AppIcon name={option.icon} size={16} color={selected ? theme.accent : theme.textSecondary} />
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
  // A tight "thumb" shadow (not the big card elevation) so the selected segment lifts subtly off
  // the recessed track.
  segmentSelected: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
