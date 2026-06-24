import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  habit: Habit;
  done: boolean;
  onToggle: (id: string) => void;
  onEdit: (habit: Habit) => void;
  /** Starts a drag-to-reorder gesture (from DraggableFlatList). */
  drag?: () => void;
  /** True while this row is being dragged. */
  isActive?: boolean;
};

function HabitRowBase({ habit, done, onToggle, onEdit, drag, isActive }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => onToggle(habit.id)}
      onLongPress={drag}
      disabled={isActive}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={habit.name}
      accessibilityHint="Activates to toggle done. Long press to reorder."
      style={({ pressed }) => [styles.row, (pressed || isActive) && styles.pressed]}>
      <MaterialIcons
        name={done ? 'check-circle' : 'radio-button-unchecked'}
        size={28}
        color={done ? theme.accent : theme.textSecondary}
      />
      <ThemedText
        type="default"
        style={[styles.label, done && { color: theme.textSecondary, textDecorationLine: 'line-through' }]}>
        {habit.name}
      </ThemedText>
      <Pressable
        onPress={() => onEdit(habit)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${habit.name}`}>
        <MaterialIcons name="more-horiz" size={24} color={theme.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56, // comfortably above the 44pt minimum tap target
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  pressed: { opacity: 0.6 },
  label: { flex: 1 },
});

// Memoized: only the toggled row's `done` changes, so the rest skip re-render.
export const HabitRow = memo(HabitRowBase);
