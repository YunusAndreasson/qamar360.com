import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import { CompletionRing } from '@/components/completion-ring';
import { ThemedText } from '@/components/themed-text';
import { Pressed, RowLeadingSlot, Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { exchangeRowContract } from '@/lib/exchange';

// The floated "⋯" button's footprint (glyph + its own padding), reserved by the main region so the
// two can't drift apart.
const OPTIONS_BOX = Spacing.two + 18 + Spacing.three;

type Props = {
  habit: Habit;
  /** Held for the viewed day — the deed happened. */
  held: boolean;
  /** Excused for the viewed day: out of the rate entirely, and the row goes inert. */
  skipped: boolean;
  /** The viewed day's completions are being (re)fetched after a day-step — see `CompletionRing`'s
   *  `settling` doc. Keeps a day already held from replaying its sweep as the data catches up. */
  settling: boolean;
  /** Hold it, or take it back. */
  onToggle: (habit: Habit) => void;
  /** Open the act sheet — skip today, insights, edit, delete. */
  onOptions: (habit: Habit) => void;
};

/**
 * One exchange: a deed you claim in the place an old routine keeps taking.
 *
 * Unlike an act inside a stack — which is a line you *read*, its completion belonging to the
 * stack's seal — an exchange is ticked on its own. It is not part of a sequence performed in one
 * go; it is a separate claim about the whole day, and holding two of three has to still count.
 *
 * **The row is the checkbox**, the same way a stack card's header is: tapping anywhere in the
 * main region holds it, tapping a held one takes it back. What the tick asserts is the deed in
 * the title — never the absence of the routine below it. That is the whole mechanism, not a
 * wording preference: a plan phrased as "don't" keeps the old routine primed and measurably
 * strengthens it, while one phrased as "this instead" displaces it.
 *
 * The mark is the same {@link CompletionRing} a stack card's header wears — the arc sweeping shut
 * around a check on the hold — so the two things the app tracks commit with one gesture and rest in
 * one tone, however different their units. A day that didn't hold has no state of its own — no red,
 * no broken streak, nothing at all — because catastrophising one slip is what turns it into the
 * next three.
 */
function ExchangeRowBase({ habit, held, skipped, settling, onToggle, onOptions }: Props) {
  const theme = useTheme();
  const row = exchangeRowContract({
    name: habit.name,
    insteadOf: habit.instead_of ?? '',
    held,
    skipped,
  });
  const color =
    row.mode === 'excused' ? theme.textSecondary : row.mode === 'held' ? theme.textDisabled : theme.text;

  return (
    // The hold region runs the row's full width and the "⋯" floats over its reserved right edge —
    // the same construction the stack header uses, and for the same reason: laid out side by side,
    // the press highlight stopped short of the card's edge and the row looked half-lit under the
    // finger.
    <View style={styles.row}>
      {/* Gesture-handler's `Touchable`, per the dense-list rule: press feedback is driven
          platform-side, so a tap costs no re-render. No haptic here — the hold's beat is fired
          from the seam in use-habits, so touch and record can never disagree. */}
      <Touchable
        onPress={() => onToggle(habit)}
        disabled={!row.enabled}
        androidRipple={row.enabled ? { color: theme.backgroundSelected } : undefined}
        underlayColor={row.enabled ? theme.backgroundSelected : undefined}
        activeUnderlayOpacity={1}
        accessibilityRole={row.role}
        accessibilityLabel={row.label}
        accessibilityHint={row.hint}
        accessibilityState={{ checked: row.checked, disabled: !row.enabled }}
        style={styles.main}>
        {/* The same 32-wide leading slot the act rows give their ordinals, so an exchange's mark
            sits in the column the stacks above it already established — and at the same 24pt as a
            stack header's ring, so the day's two commits read as one column of marks.

            Driven off the contract's `mode`, not off `held`/`skipped` again: the precedence
            between the two (excused outranks held) is resolved once, in the pure module that has
            a test, and the row simply paints what it is told. */}
        <View style={styles.leading}>
          {row.mode === 'excused' ? (
            <AppIcon name="skip" size={20} color={theme.textSecondary} />
          ) : (
            <CompletionRing complete={row.mode === 'held'} size={24} strokeWidth={2} settling={settling} />
          )}
        </View>
        <View style={styles.text}>
          <ThemedText type="rowTitle" style={{ color }} numberOfLines={1}>
            {habit.name}
          </ThemedText>
          {/* What the deed stands in for, and nothing else — the cue is read where the plan is
              made, not where it is kept (see `ExchangeRowContract`). One line: with the moment
              gone there is nothing left that could need a second, and a clamp of 2 would only
              ever fire on a routine named at essay length. */}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {row.meta}
          </ThemedText>
        </View>
      </Touchable>

      {/* The options affordance, its own tap target and its own a11y button so a screen reader
          gets it apart from the tick. Floated over the main region (transparent, so the hold's
          highlight shows through beneath it) and reachable even when the row is inert — excusing is
          the one thing an excused row still needs to undo. */}
      <Touchable
        onPress={() => onOptions(habit)}
        androidRipple={{ color: theme.backgroundSelected, borderless: true }}
        activeOpacity={Pressed.dim}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${habit.name}`}
        accessibilityHint="Skip today, insights, edit, or delete."
        style={styles.options}>
        <AppIcon name="ellipsis" size={18} color={theme.textDisabled} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'relative' },
  // 56 to match the stack cards above it, so the eye keeps one rhythm down the day — though a
  // two-line meta will push past it, which is why this is a floor and not a height.
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.three,
    // The floated "⋯" button's box (glyph + its own padding), reserved so a long deed name stops
    // where the button begins.
    paddingRight: OPTIONS_BOX,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  leading: RowLeadingSlot,
  // Spacing.three matches the stack header's glyph→title gap, landing the deed in the same
  // column as the act names and stack titles above it.
  text: { flex: 1, marginLeft: Spacing.three, gap: Spacing.half },
  options: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
  },
});

// Memoized on what the row paints. A drag-reorder anywhere in the day re-stamps `position` into a
// fresh object on EVERY habit, exchanges included — a field this row never renders — so a default
// identity compare would rebuild the whole section on the frame a drop commits (the same trap
// documented on ActRow). Keep in sync if the row starts rendering another `habit` field.
function exchangePropsEqual(a: Props, b: Props): boolean {
  return (
    a.habit.id === b.habit.id &&
    a.habit.name === b.habit.name &&
    a.habit.instead_of === b.habit.instead_of &&
    a.held === b.held &&
    a.skipped === b.skipped &&
    a.settling === b.settling &&
    a.onToggle === b.onToggle &&
    a.onOptions === b.onOptions
  );
}

export const ExchangeRow = memo(ExchangeRowBase, exchangePropsEqual);
