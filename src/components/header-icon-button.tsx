import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Scale } from '@/constants/motion';
import { Spacing } from '@/constants/theme';

import type { ReactNode } from 'react';

/**
 * A glyph named once, resolved per platform — SF Symbols on iOS, Material on
 * Android — matching the native tab bar's convention (`(tabs)/_layout.tsx`).
 */
export type HeaderIcon = { sf: SFSymbol; material: keyof typeof MaterialIcons.glyphMap };

/** Right-aligned cluster that owns the spacing between native header glyphs. */
export function HeaderActions({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** A single tappable glyph for a native header's `headerRight`/`headerLeft`. */
export function HeaderIconButton({
  icon,
  color,
  accessibilityLabel,
  onPress,
  disabled = false,
  hidden = false,
  style,
}: {
  icon: HeaderIcon;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  hidden?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || hidden}
      scaleTo={Scale.glyph}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || hidden }}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      hitSlop={10}
      style={[styles.button, style, hidden && styles.hidden]}>
      {Platform.OS === 'ios' ? (
        <SymbolView name={icon.sf} size={22} tintColor={color} type="monochrome" />
      ) : (
        <MaterialIcons name={icon.material} size={24} color={color} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // `gap` spaces the glyphs from each other; a minimal right inset keeps the
  // cluster off the screen edge without pushing the trailing icon inward.
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingRight: Spacing.half },
  button: { paddingVertical: Spacing.half, paddingHorizontal: Spacing.two },
  hidden: { opacity: 0 },
});
