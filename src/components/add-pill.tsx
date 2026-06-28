import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { useTheme } from '@/hooks/use-theme';

/** The "already added" confirmation copy — used by the expanded full-width add button. */
export const ADDED_LABEL = 'Added ✓';

/**
 * The fill + label colours every add control wears — success-tinted once added, accent before.
 * One recipe so the row's {@link AddPill} and the expanded full-width add button
 * ({@link ExpandableAddRow}) can never drift in colour.
 */
export function addControlColors(theme: ReturnType<typeof useTheme>, added: boolean) {
  return {
    backgroundColor: added ? theme.successSubtle : theme.accent,
    color: added ? theme.success : theme.accentText,
  };
}

type Props = {
  added: boolean;
  onPress: () => void;
  /** Habit/routine name, for the accessible label. */
  label: string;
};

/**
 * The always-visible trailing add control of a Discover row — a compact circular icon button
 * (a "+" that becomes a "✓" once added). Keeping "add" on its own target, separate from the
 * row body's tap-to-expand, means adding is a single tap and never requires reading the
 * details first; the expanded body still carries the full-text add button. Its fixed circle
 * size holds steady across the add → added flip so the row never jiggles, and the icon leaves
 * the title more room than the old labelled pill did.
 */
export function AddPill({ added, onPress, label }: Props) {
  const theme = useTheme();
  const { backgroundColor, color } = addControlColors(theme, added);
  return (
    <PressableScale
      onPress={added ? undefined : onPress}
      disabled={added}
      hitSlop={8}
      android_ripple={added ? undefined : { color: theme.rippleOnFill }}
      accessibilityRole="button"
      accessibilityState={{ disabled: added }}
      accessibilityLabel={added ? `${label} already added` : `Add ${label}`}
      style={[styles.pill, { backgroundColor }]}>
      <MaterialIcons name={added ? 'check' : 'add'} size={20} color={color} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16, // = width / 2, a circular tap target
    overflow: 'hidden', // clip the Android ripple to the circle
  },
});
