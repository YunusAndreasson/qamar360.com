import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { CardSection } from '@/components/card-section';
import { Fold } from '@/components/fold';
import { PlanPicks } from '@/components/plan-picks';
import { RowSeparator } from '@/components/row-separator';
import { TRAILING_GLYPH, trailingGlyphBox } from '@/components/row-trailing-button';
import { SeparatedRows } from '@/components/separated-rows';
import { TaskComposer } from '@/components/task-composer';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { RowLeadingSlot, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import type { Plan } from '@/lib/plans';
import { splitTasks, type Task, type TaskPlace } from '@/lib/tasks';

type Props = {
  /** The viewed day's tasks, in position order (`lib/tasks.visibleTasks`). */
  tasks: Task[];
  /** Space above the caption — the screen owns it, so the day's sections break on one rhythm. */
  topGap: number;
  /** The real today, so a task carried forward can say where it came from. */
  today: string;
  /** The day being viewed — what the done fold and the held rows are scoped to. */
  viewDate: string;
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

const NO_HOLDS: ReadonlyMap<string, TaskPlace> = new Map();

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
 * the rest of the day.
 *
 * **What is left to do is always on show; what is done folds away.** Every row here is a checkbox,
 * and a checkbox behind a fold costs a tap to reach — the app keeps its chevrons for things to
 * *read*, and the finished to-dos are exactly that: the record of the day. So the open ones list
 * directly and the finished ones gather behind a closing "N done" bar, in the fold the stack cards
 * use. A finished one greys in place first and folds only once the list settles (see
 * {@link splitTasks}), and a lone one never folds at all.
 */
export function TaskSection({
  tasks,
  topGap,
  today,
  viewDate,
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
  const [editing, setEditing] = useState<Task | null>(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  // Whether anything has been typed since the field opened. Not `text === ''`: Return commits and
  // clears for the next one, and a strip of suggestions slamming back under the keyboard after
  // every to-do would be worse than not offering them at all.
  const [touched, setTouched] = useState(false);

  // Both scoped to the viewed day and *derived* rather than reset, the way the stack cards' fold
  // state is (`habits/index.tsx`): the day can turn over without anyone touching this card.
  const [doneFold, setDoneFold] = useState({ day: viewDate, open: false });
  const doneOpen = doneFold.day === viewDate && doneFold.open;
  // Where each touched row was when it was touched — held there until the list settles.
  const [held, setHeld] = useState({ day: viewDate, places: NO_HOLDS });
  const places = held.day === viewDate ? held.places : NO_HOLDS;

  // The list settles whenever the screen comes back into view — returning from a sheet, from
  // another tab, from the background — and the rows then sit where their state says.
  useFocusEffect(
    useCallback(() => {
      setHeld((prev) => (prev.places.size === 0 ? prev : { day: prev.day, places: NO_HOLDS }));
    }, []),
  );

  const hold = useCallback(
    (id: string, place: TaskPlace) =>
      setHeld((prev) => {
        const current = prev.day === viewDate ? prev.places : NO_HOLDS;
        if (current.has(id)) return prev;
        return { day: viewDate, places: new Map(current).set(id, place) };
      }),
    [viewDate],
  );
  // One per half, so a tick pins the row to the half it was ticked in. Stable across renders, so
  // the rows' memo comparators hold.
  const toggleOpen = useCallback((task: Task) => {
    hold(task.id, 'open');
    onToggle(task);
  }, [hold, onToggle]);
  const toggleDone = useCallback((task: Task) => {
    hold(task.id, 'done');
    onToggle(task);
  }, [hold, onToggle]);

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
  if (tasks.length === 0 && !composerOpen) return null;

  const { open, done } = splitTasks(tasks, places);

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

  // Rewriting one happens **in its own row** — the row you tapped becomes the field, which is the
  // whole promise of the composer. It used to render only at the foot of the card, so an edit put
  // the task on screen twice: the untouched row where it has always been, and a second copy of it
  // in a field below the list.
  const row = (task: Task, onToggleRow: (task: Task) => void) =>
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
      <TaskRow key={task.id} task={task} today={today} onToggle={onToggleRow} onEdit={startEditing} onDelete={confirmDelete} />
    );

  return (
    <CardSection
      label="TO DO"
      topGap={topGap}
      // The way in, once there is a list. Suppressed on a past day: writing something down "for
      // last Tuesday" is not a thing anyone means to do — and while an edit is open, since the
      // field for that is up in the list and two live fields would fight for the keyboard.
      trailing={
        isToday && !editing ? (
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
      {open.map((task) => row(task, toggleOpen))}
      {done.length > 0 ? (
        <View>
          <DoneBar count={done.length} open={doneOpen} onPress={() => setDoneFold({ day: viewDate, open: !doneOpen })} />
          {/* The finished rows ride the stack cards' fold, so the two disclosures on the day move
              alike. Their own `SeparatedRows`: the card's rules stop at this block's edge. */}
          <Fold expanded={doneOpen}>
            <RowSeparator />
            <SeparatedRows>{done.map((task) => row(task, toggleDone))}</SeparatedRows>
          </Fold>
        </View>
      ) : null}
    </CardSection>
  );
}

/**
 * The bar the finished to-dos fold behind. Built from the day's own parts so it lands on the day's
 * two columns: the leading slot puts its count under the to-do titles, and the chevron sits on the
 * same line as every other trailing mark. Chrome at the foot — 44pt and in the reading tone, like
 * a stack's "Manage stack" — because it is the record of the day, not something left to do.
 */
function DoneBar({ count, open, onPress }: { count: number; open: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="button"
      accessibilityLabel={`${count} done`}
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? 'Hides the finished to-dos.' : 'Shows the finished to-dos.'}
      style={({ pressed }) => [styles.doneBar, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <View style={styles.leading}>
        <AppIcon name="check" size={18} color={theme.textSecondary} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.doneLabel}>
        {count} done
      </ThemedText>
      <View style={styles.doneChevron}>
        <AppIcon name={open ? 'expandLess' : 'expandMore'} size={TRAILING_GLYPH} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  doneBar: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: Spacing.three },
  leading: RowLeadingSlot,
  // The leading slot's 16pt gap, as on the rows above, so "N done" starts in their title column.
  doneLabel: { flex: 1, marginLeft: Spacing.three },
  doneChevron: trailingGlyphBox,
});
