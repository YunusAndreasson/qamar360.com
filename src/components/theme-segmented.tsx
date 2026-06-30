import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { usePreferences, type ThemePreference } from '@/hooks/use-preferences';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

import type { ComponentProps } from 'react';

type Option = {
  value: ThemePreference;
  label: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
};

// Sun / moon / auto carry the meaning at a glance and tie the control to the app's
// lunar theme, so it reads as ours rather than a stock platform widget.
const OPTIONS: Option[] = [
  { value: 'system', label: 'System', icon: 'brightness-auto' },
  { value: 'light', label: 'Light', icon: 'light-mode' },
  { value: 'dark', label: 'Dark', icon: 'dark-mode' },
];

/**
 * Appearance selector — a custom three-segment control themed to match the app's
 * cards and accent. Replaces the platform `SegmentedControl`, which looked like a
 * foreign widget dropped into the settings list.
 */
export function ThemeSegmented() {
  const theme = useTheme();
  const { themePreference, setThemePreference } = usePreferences();

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
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
            // Selected reads as a raised thumb (a lighter tonal fill) carrying the one accent touch
            // on its icon + label — not a saturated solid-accent block.
            style={[styles.segment, selected && { backgroundColor: theme.backgroundSelected }]}>
            <MaterialIcons name={option.icon} size={16} color={selected ? theme.accent : theme.textSecondary} />
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
});
