import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { Surface } from '@/components/surface';
import { TaskComposer } from '@/components/task-composer';
import { TaskRow } from '@/components/task-row';
import { Spacing } from '@/constants/theme';
import { confirmDestructive } from '@/lib/alerts';
import type { Task } from '@/lib/tasks';

type Props = {
  /** The viewed day's tasks, open ones first (`lib/tasks.visibleTasks`). */
  tasks: Task[];
  /** The real today, so a task carried forward can say where it came from. */
  today: string;
  /** Whether the viewed day is today — a past day is a record, not somewhere to write. */
  isToday: boolean;
  /** The composer has been asked for from outside (the "+" menu's Task choice). */
  composeRequested: boolean;
  /** The request is spent — clears it, so returning to the tab doesn't raise the keyboard again. */
  onComposeHandled: () => void;
  onCreate: (title: string) => void;
  onToggle: (task: Task) => void;
  onRename: (task: Task, title: string) => void;
  onDelete: (task: Task) => void;
};

/**
 * TO DO — the day's one-off things, above the practice.
 *
 * Above, and not below, because it is the part of the day that expires: a stack missed today comes
 * round again tomorrow, and a prescription not collected simply doesn't. Sitting first also puts
 * capture where the keyboard can never cover it.
 *
 * The section is **not permanent chrome**. With nothing on the list it renders nothing at all —
 * Today opens on the practice, as it did before this existed — and the way to start one is the
 * header "+". Once there is a list, the `＋ Add` row lives in the card and capture is instant for
 * the rest of the day. A finished task greys in place and leaves when the day turns over, so the
 * card stays until then rather than vanishing under the finger that emptied it.
 */
export function TaskSection({
  tasks,
  today,
  isToday,
  composeRequested,
  onComposeHandled,
  onCreate,
  onToggle,
  onRename,
  onDelete,
}: Props) {
  // The task being rewritten (the long press), or null while the composer is capturing new ones.
  const [editing, setEditing] = useState<Task | null>(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');

  // Stable across renders, so the rows' memo comparators hold — an arrow minted inside the map
  // would rebuild every row on every keystroke in the composer.
  const startEditing = useCallback((task: Task) => {
    setComposing(false);
    setEditing(task);
    setText(task.title);
  }, []);

  const confirmDelete = useCallback(
    (task: Task) =>
      confirmDestructive({
        title: 'Delete task',
        message: `Delete “${task.title}”?`,
        onConfirm: () => {
          onDelete(task);
          // Leave the edit state with it — a field still holding a deleted task's words, over a
          // row that is no longer there, is the one thing this state must not be left in.
          setEditing(null);
          setComposing(false);
          setText('');
        },
      }),
    [onDelete],
  );

  // The outside request opens the field directly rather than being copied into state — one source
  // of truth, and no effect chasing a prop. It is spent when the field closes.
  const composerOpen = isToday && (composing || editing !== null || composeRequested);
  if (tasks.length === 0 && !composerOpen) return null;

  const closeComposer = () => {
    // Keep what was typed rather than dropping it: a keyboard dismissed mid-thought (or an edit
    // left by tapping away) must not eat the thought.
    submit(text);
    setComposing(false);
    setEditing(null);
    setText('');
    if (composeRequested) onComposeHandled();
  };

  function submit(title: string) {
    const clean = title.trim();
    setText('');
    if (!clean) return;
    if (editing) {
      onRename(editing, clean);
      // Back to capturing: one edit is one edit, and the field is a new-task field again.
      setEditing(null);
      setComposing(true);
      return;
    }
    onCreate(clean);
  }

  return (
    <View style={styles.section}>
      <SectionLabel>TO DO</SectionLabel>
      <Surface>
        {tasks.map((task, i) => (
          <View key={task.id}>
            {i > 0 ? <RowSeparator /> : null}
            <TaskRow task={task} today={today} onToggle={onToggle} onEdit={startEditing} />
          </View>
        ))}
        {/* The way in, once there is a list. Suppressed on a past day: writing something down
            "for last Tuesday" is not a thing anyone means to do. */}
        {isToday ? (
          <>
            {tasks.length > 0 ? <RowSeparator /> : null}
            <TaskComposer
              open={composerOpen}
              value={text}
              onChangeText={setText}
              onOpen={() => setComposing(true)}
              onSubmit={submit}
              onClose={closeComposer}
              // Only while rewriting one: a new, unwritten task has nothing to delete.
              onDelete={editing ? () => confirmDelete(editing) : undefined}
            />
          </>
        ) : null}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  // The same 16pt horizontal inset `DragGrid` gives the stack cards — this section sits outside
  // the drag layer (a task has no slot in the day's order to be dragged into), so it reproduces
  // the alignment rather than inheriting it, exactly as the exchanges' section does.
  section: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
});
