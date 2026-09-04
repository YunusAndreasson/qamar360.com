import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { CardSection } from '@/components/card-section';
import { PlanPicks } from '@/components/plan-picks';
import { TaskComposer } from '@/components/task-composer';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import type { Plan } from '@/lib/plans';
import type { Task } from '@/lib/tasks';

type Props = {
  /** The viewed day's tasks, open ones first (`lib/tasks.visibleTasks`). */
  tasks: Task[];
  /** Space above the caption — the screen owns it, so the day's sections break on one rhythm. */
  topGap: number;
  /** The real today, so a task carried forward can say where it came from. */
  today: string;
  /** Whether the viewed day is today — a past day is a record, not somewhere to write. */
  isToday: boolean;
  /** The composer has been asked for from outside (the "+" menu's Task choice). */
  composeRequested: boolean;
  /** The request is spent — clears it, so returning to the tab doesn't raise the keyboard again. */
  onComposeHandled: () => void;
  onCreate: (title: string) => void;
  /** The plans worth offering under an untouched field — `lib/plans.planPicks`. */
  planPicks: Plan[];
  /** Write a to-do from one of them, carrying the plan's id. */
  onPick: (plan: Plan) => void;
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
  topGap,
  today,
  isToday,
  composeRequested,
  onComposeHandled,
  onCreate,
  planPicks,
  onPick,
  onToggle,
  onRename,
  onDelete,
}: Props) {
  // The task being rewritten (the long press), or null while the composer is capturing new ones.
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  // Whether anything has been typed since the field opened. Not `text === ''`: Return commits and
  // clears for the next one, and a strip of suggestions slamming back under the keyboard after
  // every to-do would be worse than not offering them at all.
  const [touched, setTouched] = useState(false);

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
        title: 'Delete to-do',
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
  const showTasks = expanded || composerOpen;
  const done = tasks.filter((task) => task.done_on !== null).length;
  if (tasks.length === 0 && !composerOpen) return null;

  const closeComposer = () => {
    // Keep what was typed rather than dropping it: a keyboard dismissed mid-thought (or an edit
    // left by tapping away) must not eat the thought.
    submit(text);
    setComposing(false);
    setEditing(null);
    setText('');
    setTouched(false);
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
    <CardSection
      label="TO DO"
      topGap={topGap}
      // The way in, once there is a list. Suppressed on a past day: writing something down "for
      // last Tuesday" is not a thing anyone means to do — and while an edit is open, since the
      // field for that is up in the list and two live fields would fight for the keyboard.
      trailing={
        isToday && !editing && showTasks ? (
          <>
            <TaskComposer
              open={composerOpen}
              value={text}
              onChangeText={(next) => {
                setText(next);
                setTouched(true);
              }}
              onOpen={() => setComposing(true)}
              onSubmit={submit}
              onClose={closeComposer}
            />
            {/* Only while the field is open and still untouched. The strip is a shortcut for the
                moment before you start writing, not a panel that lives under the field. */}
            {composerOpen && !touched && planPicks.length > 0 ? (
              <PlanPicks plans={planPicks} onPick={onPick} />
            ) : null}
          </>
        ) : null
      }>
      {tasks.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`To-dos, ${done} of ${tasks.length} complete`}
          accessibilityState={{ expanded: showTasks, disabled: composerOpen }}
          disabled={composerOpen}
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) => [styles.summary, pressed && { backgroundColor: theme.backgroundSelected }]}>
          <View style={styles.summaryText}>
            <ThemedText type="rowTitle">{tasks.length - done} remaining</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{done} of {tasks.length} complete</ThemedText>
          </View>
          <AppIcon name={showTasks ? 'expandLess' : 'expandMore'} color={theme.textSecondary} size={18} />
        </Pressable>
      ) : null}
      {showTasks ? tasks.map((task) =>
        // Rewriting one happens **in its own row** — the row you tapped becomes the field, which is
        // the whole promise of the composer. It used to render only at the foot of the card, so an
        // edit put the task on screen twice: the untouched row where it has always been, and a
        // second copy of it in a field below the list.
        editing?.id === task.id ? (
          <TaskComposer
            key={task.id}
            open
            value={text}
            onChangeText={setText}
            onOpen={() => setComposing(true)}
            onSubmit={submit}
            onClose={closeComposer}
            onDelete={() => confirmDelete(task)}
          />
        ) : (
          <TaskRow key={task.id} task={task} today={today} onToggle={onToggle} onEdit={startEditing} onDelete={confirmDelete} />
        ),
      ) : null}
    </CardSection>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, minHeight: 56 },
  summaryText: { flex: 1, gap: Spacing.half },
});
