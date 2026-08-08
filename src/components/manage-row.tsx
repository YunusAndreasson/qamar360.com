import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { RowLeadingSlot, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The quiet door at the foot of a card — "Manage stack", or the anchoring offer under the day's
 * loose habits.
 *
 * The stack's used to sit on its bar as a third trailing glyph, where it competed with the two
 * verbs that matter — sealing the stack and unfolding it — and where a finger aimed at the chevron
 * could open a menu instead. Renaming, editing, reading the history and deleting are all things you
 * do *while looking at the thing*, so they live where the thing does: behind the fold, one row
 * below its last line, in the reading tone rather than the accent one.
 *
 * In the stack card it sits INSIDE the measured body, so it folds away with the rest and, while
 * folded, leaves the a11y tree with it (see {@link Fold}). Elsewhere it is simply the last row of
 * the card, which is why the icon is a parameter: the shape is "a footer row that offers rather
 * than demands", and a full-width accent button would be demanding.
 */
export function ManageRow({
  icon = 'ellipsis',
  label,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  /** The leading glyph. `⋯` — a menu of things you can do — unless the row does one named thing. */
  icon?: IconName;
  /** What the row says — "Manage stack" / "Anchor 2 to a moment". */
  label: string;
  /** The same row, named with the unit it belongs to, for a screen reader out of context. */
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Touchable
      onPress={onPress}
      androidRipple={{ color: theme.backgroundSelected }}
      underlayColor={theme.backgroundSelected}
      activeUnderlayOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={styles.manage}>
      {/* The same 32-wide leading slot as the lines above it, so the glyph lands in their column
          and the label under their text. */}
      <View style={styles.leading}>
        <AppIcon name={icon} size={18} color={theme.textSecondary} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  // Shorter than a content row (44) — it is chrome at the foot, not part of the thing — but still
  // clears the 44pt target with its padding.
  manage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three,
  },
  leading: RowLeadingSlot,
});
