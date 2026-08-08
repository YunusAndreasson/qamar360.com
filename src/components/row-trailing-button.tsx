import { StyleSheet } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import type { IconName } from '@/constants/icons';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The second verb on a row, at its right edge.
 *
 * Every row on Today that commits something — a stack card's header, a habit, an exchange, a to-do —
 * carries exactly one of these, and the bar beside it reserves exactly {@link TRAILING_BOX} so a
 * long name stops where the button begins. What the glyph is depends on what the row has: a chevron
 * where there is more to *read* (only the stack card, which hides a sequence), a `⋯` where there are
 * things to *do*. One construction for both, or they drift in box, target and press behaviour — as
 * they did while the fold owned this geometry alone.
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
export function RowTrailingButton({
  icon,
  label,
  hint,
  expanded,
  onPress,
}: {
  icon: IconName;
  /** A STABLE name for what this opens ("Fajr acts", "Manage Chose water"). Where `expanded` is
   *  published, it already says which way the control goes; a label that flipped too would
   *  announce the state twice. */
  label: string;
  hint: string;
  /** Only a disclosure publishes this. A menu door has no expanded state to speak. */
  expanded?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Touchable
      onPress={onPress}
      androidRipple={{ color: theme.backgroundSelected, borderless: true }}
      activeOpacity={Pressed.dim}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={styles.button}>
      {/* `textSecondary`, not the `textDisabled` these glyphs used to wear: `textDisabled` is the
          app's Lc-15 legibility floor (see `theme-contract.test.ts` — deliberate and WCAG-exempt),
          which is right for an inert chip and wrong for the only control on the row. The same fix
          `disclosure-row.tsx` already made for the same reason. */}
      <AppIcon name={icon} size={18} color={theme.textSecondary} />
    </Touchable>
  );
}

/** The button's footprint: its glyph plus its own padding. The bar beside it reserves exactly this
 *  much on its right, so a full-width press region can sit under the button and still not let a
 *  long title run beneath the glyph. */
export const TRAILING_BOX = Spacing.four + 18 + Spacing.three;

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
    paddingLeft: Spacing.four,
    paddingRight: Spacing.three,
  },
});
