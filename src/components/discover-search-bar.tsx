import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, TextInput, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Scale } from '@/constants/motion';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
};

/**
 * The Discover search field — findability for a ~60-item curated library, which a single
 * long scroll can't offer. Reuses {@link FormField}'s surface, border, radius and type so
 * it reads as the same family, with a leading search glyph and an own clear button (iOS-only
 * `clearButtonMode` would leave Android without one).
 */
export function DiscoverSearchBar({ value, onChangeText, onClear }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <MaterialIcons name="search" size={20} color={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search habits & routines"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        accessibilityLabel="Search habits and routines"
        style={[styles.input, { color: theme.text }]}
      />
      {value.length > 0 ? (
        <PressableScale
          onPress={onClear}
          scaleTo={Scale.glyph}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear search">
          <MaterialIcons name="cancel" size={18} color={theme.textSecondary} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    ...Typography.default,
    flex: 1,
    paddingVertical: Spacing.two,
  },
});
