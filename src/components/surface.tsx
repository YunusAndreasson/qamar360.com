import { StyleSheet, View, type ViewProps } from 'react-native';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = ViewProps & {
  padded?: boolean;
  compact?: boolean;
  /** Lay a faint flower-of-life watermark behind the content (clipped by the card radius). */
  pattern?: boolean;
};

export function Surface({ style, padded, compact, pattern, children, ...props }: Props) {
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
      {pattern ? <GeometricBackdrop variant="card" /> : null}
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
