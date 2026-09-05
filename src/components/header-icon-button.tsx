import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlyphIcon } from '@/components/app-icon';
import { MoonPhase } from '@/components/moon-phase';
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
      style={[styles.button, style]}>
      {/* Header glyphs run a step larger on Android (Material's 24dp toolbar convention vs the
          22pt SF Symbol) — the only thing this button adds over the shared fork. */}
      <GlyphIcon glyph={icon} size={Platform.OS === 'ios' ? 22 : 24} color={color} />
    </PressableScale>
  );
}

/**
 * A header button whose glyph is the moon itself, at a given phase.
 *
 * Today's day picker opened from a calendar glyph, which said only "there is a date behind this"
 * — a thing the large title beside it was already saying, in words. This app reckons its months
 * by the moon (the Hijri date, the four lunar updates, the month ring on Progress, a reading per
 * quarter on Insights), so the shape the day *has* is a phase, and a phase is legible at 22pt in
 * a way a numeral is not: you can see from the header that the month is nearly out.
 *
 * Drawn `onSky` so it is a moon over the starfield rather than a white coin on it, and with the
 * {@link MoonPhase.rim} hairline so a new moon still reads as a moon and not as a glyph that
 * failed to load. It carries no `color`: the moon is the app's warm `complete` moonlight
 * wherever it appears, which is exactly why it is worth putting here.
 */
export function HeaderMoonButton({
  illumination,
  waxing,
  accessibilityLabel,
  onPress,
}: {
  illumination: number;
  waxing: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={Scale.glyph}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.button}>
      {/* The same size fork the glyph button takes, so the moon and the header's other marks sit
          on one optical line. */}
      <MoonPhase
        illumination={illumination}
        waxing={waxing}
        size={Platform.OS === 'ios' ? 22 : 24}
        rim
        onSky
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // `gap` spaces the glyphs from each other; a minimal right inset keeps the
  // cluster off the screen edge without pushing the trailing icon inward.
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingRight: Spacing.half },
  button: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
