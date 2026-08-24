import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { RowLeadingSlot, Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  habit: Habit;
  /** 1-based place in today's sequence — the numeral you read down. */
  ordinal: number;
  /** The stack is sealed (or this act was already done): the line recedes. */
  done: boolean;
  /** Excused for the viewed day — out of the sequence, but still shown so the stack reads whole. */
  skipped: boolean;
  /** Open this act's sheet (skip / insights / edit / move). */
  onPress: (habit: Habit) => void;
  /** Screen-reader reorder within the stack — the non-visual equivalent of the drag. */
  onMove?: (habit: Habit, delta: -1 | 1) => void;
};

/**
 * One act inside a stack: a line you *read*, not a checkbox.
 *
 * The app tracks stacks, not acts — completion belongs to the card's header ring — so this row
 * carries no ring, no tick target, and no done check. What it carries is the thing that makes a stack
 * work: an ordered, memorable sequence. The ordinal is there so the order is legible at a glance
 * and stays learnable ("second comes the page of Qurʾān"); the name is the deed itself; a count
 * goal shows its target as quiet trailing meta, because the target is part of what you're
 * remembering to do, not a control to operate.
 *
 * Tapping opens the act's sheet (excuse it today, its insights, edit, move) — tap is *inspect*,
 * the seal button completes, and a long-press still belongs to the drag layer's wrapper
 * (`DraggableMemberRow`) for reordering the sequence.
 */
function ActRowBase({ habit, ordinal, done, skipped, onPress, onMove }: Props) {
  const theme = useTheme();
  const target = habit.target_count;
  const color = done ? theme.textDisabled : skipped ? theme.textSecondary : theme.text;

  return (
    // Gesture-handler's `Touchable` rather than RN's `Pressable`: the press feedback (ripple on
    // Android, underlay on iOS) is driven platform-side, so a tap costs no re-render — this is the
    // densest list in the app and every act row re-rendering on press was pure waste. It also
    // yields to continuous gestures, which is what keeps the parent `DraggableMemberRow`'s
    // long-press pan winning over the tap.
    <Touchable
      onPress={() => onPress(habit)}
      androidRipple={{ color: theme.backgroundSelected }}
      // The iOS equivalent of the old `pressed && backgroundColor` style function — full-opacity
      // so it reads as the same solid highlight (the default 0.105 would barely register).
      underlayColor={theme.backgroundSelected}
      activeUnderlayOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={
        // An excused act has no place in today's sequence, so it is read without an ordinal —
        // the same thing the skip glyph says in place of the numeral.
        (skipped ? habit.name : `${ordinal}. ${habit.name}`) +
        (target != null ? `, ${target}${habit.target_unit ? ` ${habit.target_unit}` : ''}` : '') +
        (skipped ? ', skipped today' : done ? ', done' : '')
      }
      accessibilityHint="Activates for options — skip today, insights, edit, or move. Hold and drag to reorder the sequence."
      accessibilityActions={
        onMove
          ? [
              { name: 'moveUp', label: 'Move up' },
              { name: 'moveDown', label: 'Move down' },
            ]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'moveUp') onMove?.(habit, -1);
        if (event.nativeEvent.actionName === 'moveDown') onMove?.(habit, 1);
      }}
      style={styles.row}>
      {/* The same 32-wide leading slot the header's emblem uses, so the numerals form a clean
          column under it and the act names line up with the stack title. */}
      <View style={styles.leading}>
        {/* The ordinal, in every state but excused. **A done act shows no check** — the act is not
            tickable, so a checkmark in the one column a finger would aim at promises a control
            that does not exist, and the stack's own ring above already says the group is sealed.
            Done is carried by the greyed name alone. Excused keeps its glyph because that IS a
            per-act state you can set, from the act's own sheet. It is drawn at 20, the size the
            same glyph takes in a stack header and a loose row — one mark rendered three sizes down
            one column is the sort of thing you feel as untidiness without being able to name. */}
        {skipped ? (
          <AppIcon name="skip" size={20} color={theme.textSecondary} />
        ) : (
          <ThemedText type="small" themeColor="textDisabled" style={styles.ordinal}>
            {ordinal}
          </ThemedText>
        )}
      </View>
      {/* Clamped like every other row on the day. An act's name is free text, and this was the
          one title in the list that could grow without limit — which matters more here than
          elsewhere, because the drag engine measures a card's height at lift (`ghostH`/`slotSize`)
          and the floating ghost has to be the same size as the hole it left. Two lines, matching
          the day's other free-text rows (a task, a stackless habit); one-line clamps are for rows
          whose text is a fixed label. */}
      <ThemedText type="rowTitle" numberOfLines={2} style={[styles.name, { color }]}>
        {habit.name}
      </ThemedText>
      {/* A count goal's target, read as part of the deed ("Drank water · 8 cups") rather than
          operated: sealing the stack logs it in full. flexShrink 0 — Android clips trailing
          flex-row text otherwise (the "Undo"→"Und" gotcha). */}
      {target != null ? (
        <ThemedText type="small" themeColor="textDisabled" style={styles.target}>
          {`· ${target}${habit.target_unit ? ` ${habit.target_unit}` : ''}`}
        </ThemedText>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  // Shorter than the old 56pt tick row: without a ring to hit, the line only needs to be read
  // and to clear the 44pt target, and the tighter rhythm is what lets a five-act sequence be
  // taken in as one shape.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  leading: RowLeadingSlot,
  // Tabular figures so the numerals sit in a true column as the list crosses 9 → 10.
  ordinal: { fontVariant: ['tabular-nums'] },
  name: { flex: 1 },
  target: { flexShrink: 0 },
});

// Memoized on what the line paints. A reorder re-stamps every habit's `position` (and a move its
// `stack_id`) into a fresh object — fields this row never renders — so the default identity
// compare would rebuild every act on the frame a drop commits. Keep in sync if the row starts
// rendering another `habit` field.
function actPropsEqual(a: Props, b: Props): boolean {
  return (
    a.habit.id === b.habit.id &&
    a.habit.name === b.habit.name &&
    a.habit.target_count === b.habit.target_count &&
    a.habit.target_unit === b.habit.target_unit &&
    a.ordinal === b.ordinal &&
    a.done === b.done &&
    a.skipped === b.skipped &&
    a.onPress === b.onPress &&
    a.onMove === b.onMove
  );
}

export const ActRow = memo(ActRowBase, actPropsEqual);
