import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Pressed, Spacing } from '@/constants/theme';

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
}: {
  icon: HeaderIcon;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {Platform.OS === 'ios' ? (
        <SymbolView name={icon.sf} size={22} tintColor={color} type="monochrome" />
      ) : (
        <MaterialIcons name={icon.material} size={24} color={color} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  button: { padding: Spacing.half },
  pressed: { opacity: Pressed.glyph },
});
