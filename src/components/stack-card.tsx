import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { HabitRow } from '@/components/habit-row';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import type { Habit, HabitStack } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

/** A faint connector runs down the member check-circles so the stack reads as an ordered
 *  sequence (a timeline), not just a pile. `RAIL_LEFT` centres it on the circles (row
 *  padding + ~half the 28px icon); `ROW_HALF` is half a 56px row, so the rail starts at the
 *  first circle and ends at the last. */
const RAIL_LEFT = Spacing.three + 13;
const ROW_HALF = 28;

type Props = {
  stack: HabitStack;
  /** The stack's members scheduled for the viewed day, in sequence order. */
  members: Habit[];
  completed: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (id: string) => void;
  onEditStack: (stackId: string) => void;
  /** Starts a drag-to-reorder gesture for the whole card (from DraggableFlatList). */
  drag?: () => void;
  /** True while this card is being dragged. */
  isActive?: boolean;
};

/**
 * A stack rendered as one logical unit: a titled card holding its member habits in
 * sequence, visually set apart from the rows before and after it. Presentation only —
 * each member is still ticked individually. The header is the drag handle and opens the
 * stack editor.
 */
function StackCardBase({ stack, members, completed, onToggle, onEdit, onDelete, onEditStack, drag, isActive }: Props) {
  const theme = useTheme();

  const onHeaderLongPress = drag
    ? () => {
        haptics.selection();
        drag();
      }
    : undefined;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        isActive && styles.active,
      ]}>
      <Pressable
        onPress={() => onEditStack(stack.id)}
        onLongPress={onHeaderLongPress}
        disabled={isActive}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="button"
        accessibilityLabel={`${stack.name} stack`}
        accessibilityHint={drag ? 'Activates to edit the stack. Long press to reorder.' : 'Activates to edit the stack.'}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        {Platform.OS === 'ios' ? (
          <SymbolView name="link" size={16} tintColor={theme.accent} type="monochrome" />
        ) : (
          <MaterialIcons name="link" size={18} color={theme.accent} />
        )}
        <ThemedText type="smallBold" style={[styles.title, { color: theme.accent }]} numberOfLines={1}>
          {stack.name}
        </ThemedText>
        {/* A disclosure chevron — the honest cue that tapping the header opens the
            stack editor (where rename / regroup / delete live), replacing the old
            ambiguous "…". */}
        <MaterialIcons name="chevron-right" size={22} color={theme.textSecondary} />
      </Pressable>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.members}>
        {members.length > 1 ? (
          <View pointerEvents="none" style={[styles.rail, { backgroundColor: theme.border }]} />
        ) : null}
        {members.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            done={completed.has(habit.id)}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.three,
    marginVertical: Spacing.one,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  active: { opacity: 0.85 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  title: { flex: 1, letterSpacing: 0.3 },
  divider: { height: StyleSheet.hairlineWidth },
  members: { position: 'relative' },
  rail: { position: 'absolute', left: RAIL_LEFT, top: ROW_HALF, bottom: ROW_HALF, width: 2, borderRadius: 1 },
  pressed: { opacity: Pressed.dim },
});

// Memoized: a card re-renders only when its members' done-state or identity changes.
export const StackCard = memo(StackCardBase);
