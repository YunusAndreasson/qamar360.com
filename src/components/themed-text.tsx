import { StyleSheet, Text, type TextProps } from 'react-native';

import { HeroScale, Typography, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: keyof typeof Typography;
  themeColor?: ThemeColor;
};

// Central Dynamic Type policy: the display tiers live in fixed-size compositions (hero
// card, celebration overlay) and get the generous HeroScale cap; everything else scales freely.
// A caller's own maxFontSizeMultiplier (e.g. DenseLabelScale on grid labels) always wins.
const heroCap: Partial<Record<keyof typeof Typography, number>> = {
  display: HeroScale,
  subtitle: HeroScale,
};

export function ThemedText({ style, type = 'default', themeColor, maxFontSizeMultiplier, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        styles.base,
        { color: theme[themeColor ?? 'text'] },
        styles[type],
        style,
      ]}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? heroCap[type]}
      {...rest}
    />
  );
}

// The type ramp, plus one shared base. `includeFontPadding: false` is Android-only (a no-op on
// iOS): it drops the extra top/bottom padding Android adds beyond the font's own metrics, so the
// iOS-tuned lineHeights render as specified and text centers accurately against icons and rings.
// An individual Text can still set it back via its own `style` if a tall glyph ever needs the room.
const styles = StyleSheet.create({ ...Typography, base: { includeFontPadding: false } });
