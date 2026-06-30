import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The "already added" confirmation copy — used by the expanded full-width add button. */
export const ADDED_LABEL = 'Added ✓';

/**
 * The fill + label colours every add control wears — a solid accent button before adding (add is a
 * real primary action, so it keeps the one solid-accent fill), an accent-subtle chip once added.
 * Staying within the one steel "moonlight" accent (rather than a separate green) keeps add controls
 * in step with the habit done-check and the Progress orbit. One recipe so the row's {@link AddPill}
 * and the expanded full-width add button ({@link ExpandableAddRow}) can never drift in colour.
 */
export function addControlColors(theme: ReturnType<typeof useTheme>, added: boolean) {
  return {
    backgroundColor: added ? theme.accentSubtle : theme.accent,
    color: added ? theme.accent : theme.accentText,
  };
}

type Props = {
  added: boolean;
  onPress: () => void;
  /**
   * When added, makes the ✓ tappable to undo the add (remove the matching habit). Omit it to
   * leave the ✓ as a disabled confirmation — e.g. routines, whose removal isn't a clean
   * single-step undo.
   */
  onRemove?: () => void;
  /** Habit/routine name, for the accessible label. */
  label: string;
};

/**
 * The always-visible trailing add control of a Discover row — a compact circular icon button
 * (a "+" that becomes a "✓" once added). Keeping "add" on its own target, separate from the
 * row body's tap-to-expand, means adding is a single tap and never requires reading the
 * details first; the expanded body still carries the full-text add button. Its fixed circle
 * size holds steady across the add → added flip so the row never jiggles, and the icon leaves
 * the title more room than the old labelled pill did. When `onRemove` is given, the ✓ stays
 * live so a mis-tapped add can be undone in place rather than only from the Habits list.
 */
export function AddPill({ added, onPress, onRemove, label }: Props) {
  const theme = useTheme();
  const { backgroundColor, color } = addControlColors(theme, added);
  // Added + removable → the ✓ undoes the add; added without onRemove → an inert confirmation.
  const inert = added && !onRemove;
  return (
    <PressableScale
      onPress={added ? onRemove : onPress}
      disabled={inert}
      hitSlop={8}
      android_ripple={inert ? undefined : { color: theme.rippleOnFill }}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert }}
      accessibilityLabel={added ? (onRemove ? `Remove ${label}` : `${label} already added`) : `Add ${label}`}
      accessibilityHint={added && onRemove ? 'Removes it from your habits' : undefined}
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
    borderRadius: Radius.full, // a circular tap target
    overflow: 'hidden', // clip the Android ripple to the circle
  },
});
