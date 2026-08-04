import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { exchangeRowContract } from '@/lib/exchange';

type Props = {
  habit: Habit;
  /** Held for the viewed day — the deed happened. */
  held: boolean;
  /** Excused for the viewed day: out of the rate entirely, and the row goes inert. */
  skipped: boolean;
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
 * The mark is warm `complete` when held, matching every other done state in the app; unheld is a
 * hollow `controlTrack` ring, the role reserved for an interactive outline that has to clear 3:1
 * on the card. A day that didn't hold has no state of its own — no red, no broken streak, nothing
 * at all — because catastrophising one slip is what turns it into the next three.
 */
function ExchangeRowBase({ habit, held, skipped, onToggle, onOptions }: Props) {
  const theme = useTheme();
  const row = exchangeRowContract({
    name: habit.name,
    insteadOf: habit.instead_of ?? '',
    cue: habit.cue,
    held,
    skipped,
  });
  const color =
    row.mode === 'excused' ? theme.textSecondary : row.mode === 'held' ? theme.textDisabled : theme.text;

  return (
    // `stretch` so the tick region and the "⋯" tile the row's full height with no dead strip —
    // the same three-region construction the stack header uses.
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
            sits in the column the stacks above it already established. */}
        {/* Driven off the contract's `mode`, not off `held`/`skipped` again: the precedence
            between the two (excused outranks held) is resolved once, in the pure module that has
            a test, and the row simply paints what it is told. */}
        <View style={styles.leading}>
          {row.mode === 'excused' ? (
            <AppIcon name="skip" size={18} color={theme.textSecondary} />
          ) : row.mode === 'held' ? (
            <AppIcon name="check" size={18} color={theme.complete} />
          ) : (
            <View style={[styles.ring, { borderColor: theme.controlTrack }]} />
          )}
        </View>
        <View style={styles.text}>
          <ThemedText type="rowTitle" style={{ color }} numberOfLines={1}>
            {habit.name}
          </ThemedText>
          {/* The plan, in the order it happens: the routine being turned away from, then the
              moment it arrives. Two lines at most — past that the pairing stops being one
              glanceable thought, which is the only thing it has to be. */}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {row.meta}
          </ThemedText>
        </View>
      </Touchable>

      {/* The options affordance, its own tap target and its own a11y button so a screen reader
          gets it apart from the tick. Reachable even when the row is inert — excusing is the one
          thing an excused row still needs to undo. */}
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
  row: { flexDirection: 'row', alignItems: 'stretch' },
  // 56 to match the stack cards above it, so the eye keeps one rhythm down the day — though a
  // two-line meta will push past it, which is why this is a floor and not a height.
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  leading: { width: 32, alignItems: 'center', justifyContent: 'center' },
  // A hollow target, sized between the check that replaces it (18) and the 22pt standard glyph,
  // so the mark neither grows nor shrinks perceptibly when it fills.
  ring: { width: 20, height: 20, borderRadius: Radius.full, borderWidth: 1.5 },
  // Spacing.three matches the stack header's glyph→title gap, landing the deed in the same
  // column as the act names and stack titles above it.
  text: { flex: 1, marginLeft: Spacing.three, gap: Spacing.half },
  options: {
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
    a.habit.cue === b.habit.cue &&
    a.held === b.held &&
    a.skipped === b.skipped &&
    a.onToggle === b.onToggle &&
    a.onOptions === b.onOptions
  );
}

export const ExchangeRow = memo(ExchangeRowBase, exchangePropsEqual);
