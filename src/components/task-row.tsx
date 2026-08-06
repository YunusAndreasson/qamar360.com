import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CompletionRing } from '@/components/completion-ring';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/tasks';
import { taskRowContract } from '@/lib/tasks';

type Props = {
  task: Task;
  /** The real today — a task carried from an earlier day says so. */
  today: string;
  /** Tick it, or put it back on the list. */
  onToggle: (task: Task) => void;
  /** Open it for rewriting — where deleting it lives too (the long press). */
  onEdit: (task: Task) => void;
};

/**
 * One task: something to do once.
 *
 * The row **is** the checkbox, the way a stack card's header and an exchange row are — one column
 * of {@link CompletionRing} marks runs down the whole day, whatever unit each section tracks. Done
 * greys in place rather than vanishing or sinking: the list is a record of the day until the day
 * turns over, and a row that moved under the finger would take its own undo with it.
 *
 * **No strikethrough** on a finished task (the app's standing rule): the muted tone and the closed
 * ring already say it, and a struck line reads as cancelled rather than done.
 *
 * A long press opens it for rewriting — and that state is where deleting lives, so a task needs no
 * trailing "⋯" of its own. Both have plain twins for a screen reader (the row's accessibility
 * actions), because nothing here may be gesture-only.
 *
 * RN's `Pressable`, not gesture-handler's `Touchable`: the row sits inside a `Surface` in a
 * scrolling card, the same construction where `Touchable`'s press has failed to register before
 * (the exchange library's disclosure row).
 */
function TaskRowBase({ task, today, onToggle, onEdit }: Props) {
  const theme = useTheme();
  const done = task.done_on !== null;
  const row = taskRowContract({ title: task.title, dueOn: task.due_on, today, done });

  return (
    <Pressable
      onPress={() => onToggle(task)}
      onLongPress={() => onEdit(task)}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole={row.role}
      accessibilityLabel={row.label}
      accessibilityHint={row.hint}
      accessibilityState={{ checked: row.checked }}
      // The long press, spelled out for a screen reader — the standard activation still ticks the
      // row, so only that one capability needs naming here.
      accessibilityActions={[{ name: 'edit', label: 'Edit or delete' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'edit') onEdit(task);
      }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      {/* The same 32-wide leading slot the acts give their ordinals and the exchanges their marks,
          at the same 24pt — so the day's commits all sit in one column. */}
      <View style={styles.leading}>
        <CompletionRing complete={done} size={24} strokeWidth={2} />
      </View>
      <View style={styles.text}>
        <ThemedText type="rowTitle" style={{ color: done ? theme.textDisabled : theme.text }} numberOfLines={2}>
          {task.title}
        </ThemedText>
        {/* Only when it has come forward from an earlier day. A note of where it came from —
            never "overdue", never a count of the days it has waited. */}
        {row.meta ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {row.meta}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 56 to match the stack card headers below it; a wrapped title pushes past it, hence a floor.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  leading: { width: 32, alignItems: 'center', justifyContent: 'center' },
  // Spacing.three matches the stack header's glyph→title gap, landing the task in the same column
  // as the act names and stack titles below it.
  text: { flex: 1, marginLeft: Spacing.three, gap: Spacing.half },
});

// Memoized on what the row paints. Mirrors the comparators on `ActRow` and `ExchangeRow`: any
// unrelated state change upstream would otherwise rebuild every row in the card.
function taskPropsEqual(a: Props, b: Props): boolean {
  return (
    a.task.id === b.task.id &&
    a.task.title === b.task.title &&
    a.task.due_on === b.task.due_on &&
    a.task.done_on === b.task.done_on &&
    a.today === b.today &&
    a.onToggle === b.onToggle &&
    a.onEdit === b.onEdit
  );
}

export const TaskRow = memo(TaskRowBase, taskPropsEqual);
