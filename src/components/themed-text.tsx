import { StyleSheet, Text, type TextProps } from 'react-native';

import { Typography, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: keyof typeof Typography;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        styles.base,
        { color: theme[themeColor ?? 'text'] },
        styles[type],
        style,
      ]}
      {...rest}
    />
  );
}

// The type ramp, plus one shared base. `includeFontPadding: false` is Android-only (a no-op on
// iOS): it drops the extra top/bottom padding Android adds beyond the font's own metrics, so the
// iOS-tuned lineHeights render as specified and text centers accurately against icons and rings.
// An individual Text can still set it back via its own `style` if a tall glyph ever needs the room.
const styles = StyleSheet.create({ ...Typography, base: { includeFontPadding: false } });
