import { StyleSheet } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The "already added" confirmation copy — one source of truth for every add control. */
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
 * The always-visible trailing add control of a Discover row. Keeping "add" on its own target
 * — separate from the row body's tap-to-expand — means adding is a single tap and never
 * requires reading the details first, so one control no longer carries two meanings. A stable
 * `minWidth` holds the size across the Add → Added flip so the row doesn't jiggle.
 */
export function AddPill({ added, onPress, label }: Props) {
  const theme = useTheme();
  const { backgroundColor, color } = addControlColors(theme, added);
  return (
    <PressableScale
      onPress={added ? undefined : onPress}
      disabled={added}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      android_ripple={added ? undefined : { color: theme.rippleOnFill }}
      accessibilityRole="button"
      accessibilityState={{ disabled: added }}
      accessibilityLabel={added ? `${label} already added` : `Add ${label}`}
      style={[styles.pill, { backgroundColor }]}>
      <ThemedText type="smallBold" style={{ color }}>
        {added ? ADDED_LABEL : 'Add'}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 72,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.control,
  },
});
