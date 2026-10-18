import { StyleSheet } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import type { IconName } from '@/constants/icons';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The second verb on a row, at its right edge.
 *
 * Every row on Today that commits something (an act, a habit, an exchange, a to-do) carries one of
 * these, a `⋯` to the things you can *do* to it, and the bar beside it reserves exactly
 * {@link TRAILING_BOX} so a long name stops where the button begins. The stack card's chevron sits on
 * the same line in the same box, but is no button of its own: the whole header opens the fold.
 *
 * It is FLOATED over the bar's reserved edge rather than laid out beside it: side by side, the bar's
 * press highlight stops short of the card's right edge and reads as half-lit under the finger.
 * Absolute, transparent and full height, the highlight runs the whole row while this keeps its own
 * generous target.
 *
 * The `paddingLeft` is also the zone break between the row's two verbs: a finger that lands in the
 * ambiguous space gets the free action rather than the one that writes rows. Deliberately no
 * `hitSlop` — with two adjacent full-height targets it would only overlap two different verbs.
 *
 * No haptic: `haptics.ts` says never buzz for disclosure, and opening a menu is the same class of
 * nothing-has-happened-yet.
 */
function RowTrailingButton({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  /** A STABLE name for what this opens ("Manage Chose water"). */
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Touchable
      onPress={onPress}
      androidRipple={{ color: theme.backgroundSelected, borderless: true }}
      activeOpacity={Pressed.dim}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={styles.button}>
      {/* `textSecondary`, not the `textDisabled` these glyphs used to wear: `textDisabled` is the
          app's Lc-15 legibility floor (see `theme-contract.test.ts` — deliberate and WCAG-exempt),
          which is right for an inert chip and wrong for the only control on the row. The same fix
          `disclosure-row.tsx` already made for the same reason. */}
      <AppIcon name={icon} size={TRAILING_GLYPH} color={theme.textSecondary} />
    </Touchable>
  );
}

/** The trailing glyph's size, and the padding either side of it. Exported so the two trailing
 *  marks that are not this button — the to-do's native `⋯` menu and the done fold's chevron — sit
 *  on the same vertical line as every button that is. The to-do's `⋯` drew a 20pt glyph centred in
 *  the box (29pt from the edge, not 25) while it kept its own copy of these numbers. */
export const TRAILING_GLYPH = 18;
export const trailingGlyphBox = { paddingLeft: Spacing.four, paddingRight: Spacing.three } as const;

/** The button's footprint: its glyph plus its own padding. The bar beside it reserves exactly this
 *  much on its right, so a full-width press region can sit under the button and still not let a
 *  long title run beneath the glyph. */
export const TRAILING_BOX = trailingGlyphBox.paddingLeft + TRAILING_GLYPH + trailingGlyphBox.paddingRight;

/** The management door — everything you can *do* to the unit, one tap away in a sheet. Wears the
 *  `⋯` that means exactly that everywhere else in the app. */
export function RowOptionsButton({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return <RowTrailingButton icon="ellipsis" label={label} hint={hint} onPress={onPress} />;
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...trailingGlyphBox,
  },
});
