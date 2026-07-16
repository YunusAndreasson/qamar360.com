import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = ViewProps & {
  padded?: boolean;
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
  /**
   * Styles for the inner content layer (gap, padding overrides, a colour tint) — distinct from
   * `style`, which positions the whole card (margins, opacity) and carries the elevation shadow.
   * The split exists because a soft shadow needs an un-clipped outer view while the content needs
   * `overflow: 'hidden'` to keep press highlights + the pattern inside the rounded corners; one
   * `overflow: 'hidden'` view can't do both (it would clip its own shadow on iOS).
   */
  contentStyle?: StyleProp<ViewStyle>;
};

export function Surface({
  style,
  contentStyle,
  padded,
  pattern = false,
  patternVariant = 'card',
  children,
  ...props
}: Props) {
  const theme = useTheme();
  const radius = Radius.card;
  return (
    // Outer: the elevation shadow + the card's position. No `overflow: hidden` here — that would
    // clip the shadow away on iOS. Opaque backing so the shadow has a shape to cast.
    <View
      style={[Elevation.card, { borderRadius: radius, backgroundColor: theme.backgroundElement }, style]}
      {...props}>
      {/* Inner: the visible card — clipped to the radius so the pattern + any press highlight stay
          inside the rounded corners. A lighter top edge reads as "lit from above". */}
      <View
        style={[
          styles.clip,
          {
            borderRadius: radius,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            borderTopColor: theme.topHighlight,
          },
          padded && styles.padded,
          contentStyle,
        ]}>
        {pattern ? <GeometricBackdrop variant={patternVariant} /> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.three,
  },
});
