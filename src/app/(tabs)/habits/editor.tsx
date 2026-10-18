import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { HabitEditorForm } from '@/components/habit-editor';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { type HabitCreate, useHabits } from '@/hooks/use-habits';
import { useStackActions } from '@/hooks/use-stack-actions';
import { siblingNames } from '@/lib/names';

/**
 * One params-driven screen for both new and edit, presented as a native modal
 * sheet by the Habits Stack. `id="new"` creates; any other id edits that act.
 * Save/Delete (and Cancel) just `router.back()` to the list.
 *
 * A `stackId` is honoured but no longer required. It used to be: creating without one closed the
 * screen rather than "mint an orphan", back when a habit lived in a stack or nowhere. A habit with
 * no stack is now an ordinary unit of the day (see `HabitSection`), so this screen is its create
 * path too — reached from Discover's "Custom" and "Create your own habit" when that library is
 * opened unscoped (the "+" menu's Habit), which once pushed here only to be popped straight back.
 */
export default function HabitEditorScreen() {
  const router = useRouter();
  const { id, stackId } = useLocalSearchParams<{ id?: string; stackId?: string }>();
  const { habits, stacks, createHabits, createHabitInStack, updateHabit, deleteHabit } = useHabits();

  const isNew = !id || id === 'new';
  const habit = isNew ? null : (habits.find((h) => h.id === id) ?? null);

  // Opened from the stack-scoped Add screen: the new act lands straight in that stack. Without one
  // it lands loose — `createHabits` writes `stack_id` null, which is exactly what an unanchored
  // habit is (the same call the exchange form makes).
  const targetStack = isNew && stackId ? (stacks.find((s) => s.id === stackId) ?? null) : null;
  const onCreate = (input: HabitCreate) => {
    if (targetStack) void createHabitInStack(input, targetStack.id);
    else void createHabits([input]);
  };

  // The stack this act belongs to, if any, + a handler to edit it. Both stay null for a loose
  // habit, and the form simply omits that block.
  const stackName = habit?.stack_id ? (stacks.find((s) => s.id === habit.stack_id)?.name ?? null) : null;
  const openStackActions = useStackActions();
  const onEditStack = habit && habit.stack_id ? () => openStackActions(habit.stack_id!) : undefined;

  // Normalized names of the other habits in the same stack (or, loose, the other loose habits) —
  // the form rejects a name that collides with one of these, since two identical rows side by side
  // are indistinguishable (there's no DB uniqueness backing the name). Across stacks the same name
  // is fine: reading Qurʾān after Fajr and again after ʿIshāʾ are two acts. The habit being edited
  // is excluded so keeping its own name is fine.
  const container = isNew ? (targetStack?.id ?? null) : (habit?.stack_id ?? null);
  const existingNames = useMemo(() => siblingNames(habits, container, id), [habits, container, id]);

  // Editing an act that no longer exists (stale deep link / deleted elsewhere): back out rather
  // than render a form that can't commit. Creating is never stale — with no stack the habit is
  // simply created loose, and a `stackId` that went missing mid-flow degrades to the same thing
  // rather than throwing the half-typed form away.
  const stale = isNew ? false : !habit;
  useBackIfStale(stale);
  if (stale) return null;

  return (
    <HabitEditorForm
      habit={habit}
      existingNames={existingNames}
      stackName={stackName}
      // An act belongs to a sequence; a habit stands on its own. Decided by whether there is a
      // stack in the picture at all — the one being created into, or the one being edited from.
      noun={targetStack || habit?.stack_id ? 'act' : 'habit'}
      onEditStack={onEditStack}
      onClose={() => router.back()}
      onCreate={onCreate}
      onSave={updateHabit}
      onDelete={deleteHabit}
    />
  );
}
