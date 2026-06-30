import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

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
  /**
   * Render as a plain `Pressable` (ripple only) instead of the Reanimated `PressableScale`.
   * Use for pills that sit in a screen with a native-stack transition — e.g. the pinned Discover
   * filter chips: a Reanimated view there is hoisted into react-native-screens' transition overlay
   * and "flies" over the header on push/pop. A plain Pressable stays put. (Scale press feedback is
   * dropped; the ripple + selected fill still give touch feedback.)
   */
  noScale?: boolean;
};

/**
 * The app's one selectable chip/pill — paints `accent` when `selected` and the card surface when
 * not, with the standard tactile press feedback and Android ripple. Owns only the colour recipe +
 * feedback; pass `style` for the specific shape (a weekday circle, a grid cell, a flex segment, a
 * filter chip). Replaces the hand-rolled `on ? accent : backgroundElement` recipe that was repeated
 * across the habit editor and the Discover filter chips.
 */
export function SelectablePill({ selected, label, textType = 'smallBold', style, noScale, ...props }: Props) {
  const theme = useTheme();
  const pillStyle = [
    styles.pill,
    { backgroundColor: selected ? theme.accent : theme.backgroundElement, borderColor: selected ? theme.accent : theme.border },
    style,
  ];
  const content = (
    <ThemedText type={textType} style={{ color: selected ? theme.accentText : theme.textSecondary }}>
      {label}
    </ThemedText>
  );

  return noScale ? (
    <Pressable android_ripple={{ color: theme.backgroundSelected }} style={pillStyle} {...props}>
      {content}
    </Pressable>
  ) : (
    <PressableScale android_ripple={{ color: theme.backgroundSelected }} style={pillStyle} {...props}>
      {content}
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
