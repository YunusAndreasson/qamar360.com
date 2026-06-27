import { StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  /** Visual on/off state. Drives the fill, border and label colour. */
  selected: boolean;
  label: string;
  /** Label typography variant. Defaults to `smallBold`. */
  textType?: keyof typeof Typography;
  /** Shape/size override (e.g. a fixed-size grid cell or a flex segment). */
  style?: StyleProp<ViewStyle>;
};

/**
 * The app's one selectable chip/pill — a `PressableScale` that paints `accent` when
 * `selected` and the card surface when not, with the standard tactile press feedback
 * and Android ripple. Owns only the colour recipe + feedback; pass `style` for the
 * specific shape (a weekday circle, a grid cell, a flex segment, a filter chip).
 * Replaces the hand-rolled `on ? accent : backgroundElement` recipe that was repeated
 * across the habit editor and the Discover filter chips.
 */
export function SelectablePill({ selected, label, textType = 'smallBold', style, ...props }: Props) {
  const theme = useTheme();
  return (
    <PressableScale
      android_ripple={{ color: theme.backgroundSelected }}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? theme.accent : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
        },
        style,
      ]}
      {...props}>
      <ThemedText type={textType} style={{ color: selected ? theme.accentText : theme.textSecondary }}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
