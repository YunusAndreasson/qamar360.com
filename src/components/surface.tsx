import { StyleSheet, View, type ViewProps } from 'react-native';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = ViewProps & {
  padded?: boolean;
  compact?: boolean;
  /**
   * Faint flower-of-life watermark behind the content (clipped by the card radius). On by
   * default so *every* card carries the same brand texture — the app's one consistency rule
   * for the motif. Pass `pattern={false}` only to opt a card out (e.g. behind a busy
   * visualization that would compete with it).
   */
  pattern?: boolean;
  /** `'card'` (default) is the fine small-circle texture; `'hero'` is the large seed-of-life
   *  reserved for the Progress moon card, where it blends with the moon disc. */
  patternVariant?: 'card' | 'hero';
};

export function Surface({ style, padded, compact, pattern = true, patternVariant = 'card', children, ...props }: Props) {
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
