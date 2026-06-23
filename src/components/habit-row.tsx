import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';

/** Accent used for a completed tick (matches the app's link blue). */
const ACCENT = '#3c87f7';

type Props = {
  habit: Habit;
  done: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
};

function HabitRowBase({ habit, done, onToggle, onDelete }: Props) {
  const theme = useTheme();

  const confirmDelete = () =>
    Alert.alert('Delete habit', `Delete “${habit.name}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(habit.id) },
    ]);

  return (
    <Pressable
      onPress={() => onToggle(habit.id)}
      onLongPress={confirmDelete}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={habit.name}
      accessibilityHint="Activates to toggle done. Long press to delete."
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <MaterialIcons
        name={done ? 'check-circle' : 'radio-button-unchecked'}
        size={28}
        color={done ? ACCENT : theme.textSecondary}
      />
      <ThemedText
        type="default"
        style={[styles.label, done && { color: theme.textSecondary, textDecorationLine: 'line-through' }]}>
        {habit.name}
      </ThemedText>
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
