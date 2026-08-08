import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import { CompletionRing } from '@/components/completion-ring';
import { RowOptionsButton, TRAILING_BOX } from '@/components/row-trailing-button';
import { ThemedText } from '@/components/themed-text';
import { Disabled, RowLeadingSlot, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LooseRowContract } from '@/lib/loose-row';

type Props = {
  /** Everything the bar paints and announces, resolved by the caller's contract function. */
  contract: LooseRowContract;
  /** The viewed day's completions are being (re)fetched after a day-step — see `CompletionRing`'s
   *  `settling` doc. Keeps a day already ticked from replaying its sweep as the data catches up. */
  settling: boolean;
  /** Tick it, or take it back. */
  onToggle: () => void;
  /** The management door at the row's right edge. */
  options: { accessibilityLabel: string; accessibilityHint: string; onPress: () => void };
};

/**
 * A row for one of the day's **stackless** units — an exchange, or a habit with no stack.
 *
 * Unlike an act inside a stack — which is a line you *read*, its completion belonging to the
 * stack's seal — these are ticked on their own. They are not part of a sequence performed in one
 * go; each is a separate claim about the day, and doing two of three has to still count.
 *
 * **The row is the checkbox**, the same way a stack card's header is: tapping anywhere in the main
 * region commits it, tapping a committed one takes it back. The mark is the same
 * {@link CompletionRing} a stack card's header wears — the arc sweeping shut around a check — so
 * everything the app tracks commits with one gesture and rests in one tone, however different the
 * units. A day that didn't happen has no state of its own — no red, no broken streak, nothing at
 * all — because catastrophising one slip is what turns it into the next three.
 *
 * **Two lines, then the `⋯`.** These rows briefly wore the stack card's fold, for the symmetry.
 * What it opened onto was a two-word schedule (or, for an exchange with no cue, *nothing but the
 * manage door*) — so the same chevron 8pt below a stack's meant two wildly different payoffs, which
 * is precisely how a disclosure stops being believed. The schedule and the goal moved onto the bar,
 * where they can be scanned down the column with the names they belong to, and the `⋯` opens the
 * sheet that always held the real depth — in one tap instead of two. A chevron on Today now means
 * "there is more of this to read"; a `⋯` means "there are things you can do to this."
 *
 * This component is the shape. The *words* belong to each caller's contract (`exchangeRowContract`
 * / `habitRowContract`), because an exchange is **held** and a habit is **done**, and that
 * difference is worth keeping.
 */
export function LooseRow({ contract, settling, onToggle, options }: Props) {
  const theme = useTheme();
  const color =
    contract.mode === 'excused' ? theme.textSecondary : contract.mode === 'held' ? theme.textDisabled : theme.text;

  return (
    // The commit region runs the row's full width and the `⋯` floats over its reserved right edge —
    // the same construction the stack header uses, and for the same reason: laid out side by side,
    // the press highlight stopped short of the card's edge and the row looked half-lit under the
    // finger.
    <View style={styles.bar}>
      {/* Gesture-handler's `Touchable`, per the dense-list rule: press feedback is driven
          platform-side, so a tap costs no re-render. No haptic here — the beat is fired from the
          seam in use-habits, so touch and record can never disagree. */}
      <Touchable
        onPress={onToggle}
        disabled={!contract.enabled}
        androidRipple={contract.enabled ? { color: theme.backgroundSelected } : undefined}
        underlayColor={contract.enabled ? theme.backgroundSelected : undefined}
        activeUnderlayOpacity={1}
        accessibilityRole={contract.role}
        accessibilityLabel={contract.label}
        accessibilityHint={contract.hint}
        accessibilityState={{ checked: contract.checked, disabled: !contract.enabled }}
        // See `CompletionRing`'s `settling` doc: while a day-step's blanked state is in flight,
        // dim the whole row instead of asserting the confident-but-possibly-wrong "open" look —
        // the flash of white mark + full-bright title that reads as broken. The real mark and
        // color land the moment the fetch resolves.
        style={[styles.main, settling && styles.settling]}>
        {/* The same 32-wide leading slot the act rows give their ordinals, so these marks sit in
            the column the stacks above already established — and at the same 24pt as a stack
            header's ring, so the day's commits read as one column of marks.

            Driven off the contract's `mode`, not off the booleans again: the precedence between
            them (excused outranks done) is resolved once, in the pure module that has a test, and
            the row simply paints what it is told. */}
        <View style={styles.leading}>
          {contract.mode === 'excused' ? (
            <AppIcon name="skip" size={20} color={theme.textSecondary} />
          ) : (
            <CompletionRing complete={contract.mode === 'held'} size={24} strokeWidth={2} settling={settling} />
          )}
        </View>
        <View style={styles.text}>
          <ThemedText type="rowTitle" style={{ color }} numberOfLines={1}>
            {contract.title}
          </ThemedText>
          {/* One line: a second would only ever fire on something named at essay length. */}
          {contract.meta ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {contract.meta}
            </ThemedText>
          ) : null}
        </View>
      </Touchable>

      {/* Always enabled, even on an excused row: this is how you reach the sheet, and un-excusing is
          the one thing an inert row still needs to be able to undo. */}
      <RowOptionsButton
        label={options.accessibilityLabel}
        hint={options.accessibilityHint}
        onPress={options.onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'relative' },
  // 56 to match the stack cards above it, so the eye keeps one rhythm down the day — though a
  // two-line meta will push past it, which is why this is a floor and not a height.
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.three,
    // The floated `⋯` button's box, reserved so a long name stops where the button begins — the
    // same constant the stack header reserves for its chevron, so the day's trailing glyphs hold
    // one vertical line.
    paddingRight: TRAILING_BOX,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  // See the row's `settling` comment: a plain dim, not an animation.
  settling: { opacity: Disabled },
  leading: RowLeadingSlot,
  // Spacing.three matches the stack header's glyph→title gap, landing the name in the same column
  // as the act names and stack titles above it.
  text: { flex: 1, marginLeft: Spacing.three, gap: Spacing.half },
});
