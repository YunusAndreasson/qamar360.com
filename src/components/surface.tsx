import { StyleSheet, View, type ViewProps } from 'react-native';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = ViewProps & {
  padded?: boolean;
  compact?: boolean;
  /**
   * Faint flower-of-life watermark behind the content (clipped by the card radius). Off by
   * default: the ambient texture lives on the screen backdrop, so plain cards stay clean and
   * legible. Opt in only where the motif is a deliberate accent — accent-coloured cards (the
   * Discover "essentials" card) and the Progress moon hero.
   */
  pattern?: boolean;
  /** `'card'` (default) is the fine small-circle texture; `'hero'` is the large seed-of-life
   *  reserved for the Progress moon card, where it blends with the moon disc. */
  patternVariant?: 'card' | 'hero';
};

export function Surface({ style, padded, compact, pattern = false, patternVariant = 'card', children, ...props }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.surface,
        padded && styles.padded,
        compact && styles.compact,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}
      {...props}>
      {pattern ? <GeometricBackdrop variant={patternVariant} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.three,
  },
  compact: {
    borderRadius: Radius.control,
  },
});
