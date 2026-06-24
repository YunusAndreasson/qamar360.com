import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo, useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Props = {
  habit: Habit;
  done: boolean;
  onToggle: (id: string) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (id: string) => void;
  /** Starts a drag-to-reorder gesture (from DraggableFlatList). */
  drag?: () => void;
  /** True while this row is being dragged. */
  isActive?: boolean;
};

function HabitRowBase({ habit, done, onToggle, onEdit, onDelete, drag, isActive }: Props) {
  const theme = useTheme();

  // Spring "pop" on the check icon when a habit is completed — a tactile-feeling
  // confirmation. We skip the very first run so rows that load already-done don't
  // animate on mount; only a genuine toggle pops.
  const scale = useSharedValue(1);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    scale.value = done
      ? withSequence(
          withSpring(1.3, { damping: 6, stiffness: 320, mass: 0.6 }),
          withSpring(1, { damping: 14, stiffness: 240 }),
        )
      : withSpring(1, { damping: 16, stiffness: 240 });
  }, [done, scale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Long-press hands off to DraggableFlatList; a selection tick marks the pickup.
  const onLongPress = drag
    ? () => {
        haptics.selection();
        drag();
      }
    : undefined;

  // Edit and Delete moved off a per-row "..." button into a trailing swipe — the
  // platform-standard home for a list item's rare secondary actions (Reminders,
  // Mail). The row stays a clean check + label; the gesture stays out of the way
  // of tap-to-toggle and long-press-to-reorder.
  const confirmDelete = () => {
    Alert.alert('Delete habit', `Delete “${habit.name}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(habit.id) },
    ]);
  };

  const renderRightActions = (
    _progress: unknown,
    _translation: unknown,
    swipeable: SwipeableMethods,
  ) => (
    <View style={styles.actions}>
      <Pressable
        onPress={() => {
          swipeable.close();
          onEdit(habit);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${habit.name}`}
        android_ripple={{ color: theme.backgroundSelected }}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: theme.backgroundSelected },
          pressed && styles.actionPressed,
        ]}>
        <MaterialIcons name="edit" size={20} color={theme.text} />
        <ThemedText type="small" style={{ color: theme.text }}>
          Edit
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={() => {
          swipeable.close();
          confirmDelete();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${habit.name}`}
        android_ripple={{ color: '#FFFFFF33' }}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: theme.danger },
          pressed && styles.actionPressed,
        ]}>
        <MaterialIcons name="delete" size={20} color="#FFFFFF" />
        <ThemedText type="small" style={styles.deleteLabel}>
          Delete
        </ThemedText>
      </Pressable>
    </View>
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      // While a reorder drag is in progress, the row is following the finger —
      // don't let a stray horizontal pan also open the swipe panel.
      enabled={!isActive}>
      <Pressable
        onPress={() => onToggle(habit.id)}
        onLongPress={onLongPress}
        disabled={isActive}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={habit.name}
        accessibilityHint={
          drag
            ? 'Activates to toggle done. Long press to reorder. Swipe left to edit or delete.'
            : 'Activates to toggle done. Swipe left to edit or delete.'
        }
        // Transparent so the row inherits whatever surface it sits on — the page
        // background when standalone, the card surface when inside a stack. The
        // swipe panel is revealed beside the row, never under it, so no fill is
        // needed to mask it.
        style={({ pressed }) => [styles.row, (pressed || isActive) && styles.pressed]}>
        <Animated.View style={iconStyle}>
          <MaterialIcons
            name={done ? 'check-circle' : 'radio-button-unchecked'}
            size={28}
            color={done ? theme.accent : theme.textSecondary}
          />
        </Animated.View>
        <ThemedText
          type="default"
          style={[styles.label, done && { color: theme.textSecondary, textDecorationLine: 'line-through' }]}>
          {habit.name}
        </ThemedText>
      </Pressable>
    </ReanimatedSwipeable>
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
  pressed: { opacity: Pressed.dim },
  label: { flex: 1 },
  actions: { flexDirection: 'row' },
  action: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  actionPressed: { opacity: Pressed.dim },
  deleteLabel: { color: '#FFFFFF' },
});

// Memoized: only the toggled row's `done` changes, so the rest skip re-render.
export const HabitRow = memo(HabitRowBase);
