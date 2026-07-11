import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { DraggableMemberRow } from '@/components/habit-drag';
import { HabitRow } from '@/components/habit-row';
import { PressableScale } from '@/components/pressable-scale';
import { RoutineCompleteFlash } from '@/components/routine-complete-flash';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Habit, HabitStack } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { isRoutineComplete } from '@/lib/progress';

type Props = {
  stack: HabitStack;
  /** The stack's members scheduled for the viewed day, in sequence order. */
  members: Habit[];
  completed: Set<string>;
  /** Ids of members skipped (excused) for the viewed day. */
  skipped: Set<string>;
  /** For count-goal members: the count logged for the viewed day (habit id → count). */
  counts: Map<string, number>;
  onToggle: (id: string) => void;
  /** Step a count-goal member's logged count for the viewed day by `delta` (±1). */
  onAdjust: (id: string, delta: number) => void;
  onSkip: (id: string) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (id: string) => void;
  onEditStack: (stackId: string) => void;
  /** Detach a member back to standalone (the member row's "Remove from routine" swipe). */
  onRemoveFromRoutine: (habit: Habit) => void;
  /** Screen-reader reorder for the whole routine (Move up / Move down on the header). */
  onMove?: (stackId: string, delta: -1 | 1) => void;
  /** Screen-reader reorder for a member within the routine (forwarded to each row). */
  onMoveHabit?: (habit: Habit, delta: -1 | 1) => void;
};

/**
 * A stack rendered as one logical unit: a titled card holding its member habits in
 * sequence, visually set apart from the rows before and after it. Presentation only —
 * each member is still ticked individually. The header opens the stack editor. In the
 * Today grid the card takes part in the drag vocabulary: hold anywhere on it to lift and
 * reorder the whole routine, hold a member row to pull that habit out, and a loose habit
 * dropped onto the card's body joins the routine (the drag layer draws the accent ring).
 * When a tick resolves every act the routine has due today, its border flashes the "done"
 * tone (see {@link RoutineCompleteFlash}) with a synced haptic — the group sealing.
 */
function StackCardBase({ stack, members, completed, skipped, counts, onToggle, onAdjust, onSkip, onEdit, onDelete, onEditStack, onRemoveFromRoutine, onMove, onMoveHabit }: Props) {
  const theme = useTheme();
  // The whole group sealed — every act the routine has due today is done. Drives the one-shot
  // border flash; the synced completion haptic is fired from the toggle seam in use-habits.
  const routineComplete = isRoutineComplete(members, completed, skipped);

  return (
    <View>
      <Surface>
        <PressableScale
          onPress={() => onEditStack(stack.id)}
          android_ripple={{ color: theme.backgroundSelected }}
          accessibilityRole="button"
          accessibilityLabel={`${stack.name} routine`}
          accessibilityHint="Activates to manage the routine — rename or delete it. Hold and drag to reorder the whole routine."
          accessibilityActions={
            onMove
              ? [
                  { name: 'moveUp', label: 'Move up' },
                  { name: 'moveDown', label: 'Move down' },
                ]
              : undefined
          }
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'moveUp') onMove?.(stack.id, -1);
            if (event.nativeEvent.actionName === 'moveDown') onMove?.(stack.id, 1);
          }}
          style={styles.header}>
          {/* No leading link glyph — the accent title alone marks this as a routine header; a cleaner,
              quieter card (the members' connector rail already reads as "grouped"). */}
          <ThemedText type="smallBold" themeColor="accent" style={styles.title} numberOfLines={1}>
            {stack.name}
          </ThemedText>
          {/* A quiet "⋯ more" glyph, not a › — tapping the header opens the manage sheet (rename /
              delete), it doesn't navigate into a screen. Kept small + dim: the card's real verbs are
              drag + ticking members, so this affordance recedes. */}
          <AppIcon name="ellipsis" size={18} color={theme.textDisabled} />
        </PressableScale>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View>
          {members.map((habit, index) => (
            <View key={habit.id}>
              {/* Inset row divider — the same inset-grouped-list rule as the Settings sections. */}
              {index > 0 ? <RowSeparator /> : null}
              {/* Swipe a member left to remove it from the routine (or skip/edit/delete); hold and
                  drag it to pull it out of the card — to a spot in the day list, or into another
                  routine. */}
              <DraggableMemberRow habitId={habit.id} parentStackId={stack.id} memberIndex={index}>
                <HabitRow
                  habit={habit}
                  done={completed.has(habit.id)}
                  skipped={skipped.has(habit.id)}
                  count={counts.get(habit.id) ?? 0}
                  onToggle={onToggle}
                  onAdjust={onAdjust}
                  onSkip={onSkip}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onRemoveFromRoutine={onRemoveFromRoutine}
                  onMove={onMoveHabit}
                />
              </DraggableMemberRow>
            </View>
          ))}
        </View>
      </Surface>
      {/* Sibling of the Surface (not a child — the Surface clips its content), so the 2px border
          overlays the whole card at its rounded rect and flashes when the routine seals. */}
      <RoutineCompleteFlash complete={routineComplete} />
    </View>
  );
}

const styles = StyleSheet.create({
  // A bare `Surface` card (radius/border/bg come from Surface) — no margins: the drag grid
  // measures the bare item, so spacing comes from the grid's `gap` + its padding.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  title: { flex: 1 },
  // Full-bleed rule under the stack header (a header separator, distinct from the row dividers).
  divider: { height: StyleSheet.hairlineWidth },
});

// Memoized on what the card paints. Like HabitRow, a reorder re-stamps every member's `position`
// into a fresh object and `entries` hands over a fresh `members` array each render — so the default
// identity compare would rebuild the whole card (every member's drag subtree) on the frame a drop
// commits. Compare the rendered stack fields, the members by the fields their rows read, and the
// day-state Sets + callbacks by identity (a tick swaps the Set identity, so completions still land).
function stackPropsEqual(a: Props, b: Props): boolean {
  if (
    a.stack.id !== b.stack.id ||
    a.stack.name !== b.stack.name ||
    a.completed !== b.completed ||
    a.skipped !== b.skipped ||
    a.counts !== b.counts ||
    a.onToggle !== b.onToggle ||
    a.onAdjust !== b.onAdjust ||
    a.onSkip !== b.onSkip ||
    a.onEdit !== b.onEdit ||
    a.onDelete !== b.onDelete ||
    a.onEditStack !== b.onEditStack ||
    a.onRemoveFromRoutine !== b.onRemoveFromRoutine ||
    a.onMove !== b.onMove ||
    a.onMoveHabit !== b.onMoveHabit ||
    a.members.length !== b.members.length
  ) {
    return false;
  }
  return a.members.every((m, i) => {
    const n = b.members[i]!;
    return (
      m.id === n.id &&
      m.name === n.name &&
      m.target_count === n.target_count &&
      m.target_unit === n.target_unit
    );
  });
}

export const StackCard = memo(StackCardBase, stackPropsEqual);
