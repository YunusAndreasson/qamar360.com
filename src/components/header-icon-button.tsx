import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlyphIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import type { IconGlyph } from '@/constants/icons';
import { Scale } from '@/constants/motion';
import { Spacing } from '@/constants/theme';

import type { ReactNode } from 'react';

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
  style,
}: {
  icon: IconGlyph;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={Scale.glyph}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={10}
      style={[styles.button, style]}>
      {/* Header glyphs run a step larger on Android (Material's 24dp toolbar convention vs the
          22pt SF Symbol) — the only thing this button adds over the shared fork. */}
      <GlyphIcon glyph={icon} size={Platform.OS === 'ios' ? 22 : 24} color={color} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // `gap` spaces the glyphs from each other; a minimal right inset keeps the
  // cluster off the screen edge without pushing the trailing icon inward.
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingRight: Spacing.half },
  button: { paddingVertical: Spacing.half, paddingHorizontal: Spacing.two },
});
