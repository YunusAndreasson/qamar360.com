import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CompletionRing } from '@/components/completion-ring';
import { RowMenu } from '@/components/native-menu';
import { TRAILING_BOX } from '@/components/row-trailing-button';
import { ThemedText } from '@/components/themed-text';
import { RowLeadingSlot, UnitRow, UnitRowText } from '@/constants/theme';
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
  onDelete: (task: Task) => void;
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
 * A long press opens it for rewriting, and that state is where deleting lives. The same door has a
 * visible `⋯` at the row's right edge, in the column the stack cards' chevrons and the habit rows'
 * options buttons hold — because a capability whose only signifier is a gesture is one most people
 * never find, however well the gesture works once you know it. (It also has a screen-reader twin in
 * the row's accessibility actions; nothing here may be reachable only one way.)
 *
 * RN's `Pressable`, not gesture-handler's `Touchable`: the row sits inside a `Surface` in a
 * scrolling card, the same construction where `Touchable`'s press has failed to register before
 * (the exchange library's disclosure row).
 */
function TaskRowBase({ task, today, onToggle, onEdit, onDelete }: Props) {
  const theme = useTheme();
  const done = task.done_on !== null;
  const row = taskRowContract({ title: task.title, dueOn: task.due_on, today, done });

  return (
    // The commit region runs the full width with the `⋯` floated over its reserved right edge — the
    // construction every other row on the day uses, so the press highlight lights the whole row.
    <View style={styles.bar}>
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
          {/* Done wears `textDisabled`, the day's one "done" tone, as the acts and the stackless
              habits already do. Clamped at two lines like every other free-text row. */}
          <ThemedText type="rowTitle" numberOfLines={2} style={{ color: done ? theme.textDisabled : theme.text }}>
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

      <RowMenu label={`Options for ${task.title}`} actions={[
        { id: 'edit', title: 'Edit', icon: 'edit', onSelect: () => onEdit(task) },
        { id: 'delete', title: 'Delete', icon: 'delete', destructive: true, onSelect: () => onDelete(task) },
      ]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'relative' },
  row: {
    ...UnitRow,
    // The floated `⋯` button's box, the same constant the stack headers and the loose rows reserve,
    // so every trailing glyph on the day holds one vertical line.
    paddingRight: TRAILING_BOX,
  },
  leading: RowLeadingSlot,
  text: UnitRowText,
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
    a.onEdit === b.onEdit &&
    a.onDelete === b.onDelete
  );
}

export const TaskRow = memo(TaskRowBase, taskPropsEqual);
