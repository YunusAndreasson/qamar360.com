import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { HabitEditorForm } from '@/components/habit-editor';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { type HabitCreate, useHabits } from '@/hooks/use-habits';
import { useStackActions } from '@/hooks/use-stack-actions';
import { otherNames } from '@/lib/names';

/**
 * One params-driven screen for both new and edit, presented as a native modal
 * sheet by the Habits Stack. `id="new"` creates; any other id edits that act.
 * Save/Delete (and Cancel) just `router.back()` to the list.
 *
 * Creating REQUIRES a `stackId`: an act lives in a stack or nowhere, so there is no unanchored
 * create path to fall back to. Every caller supplies one (the stack-scoped Add screen, the empty
 * card's "Add your first act"); the guard below closes the screen rather than mint an orphan.
 */
export default function HabitEditorScreen() {
  const router = useRouter();
  const { id, stackId } = useLocalSearchParams<{ id?: string; stackId?: string }>();
  const { habits, stacks, createHabitInStack, updateHabit, deleteHabit } = useHabits();

  const isNew = !id || id === 'new';
  const habit = isNew ? null : (habits.find((h) => h.id === id) ?? null);

  // Opened from the stack-scoped Add screen: the new act lands straight in that stack.
  const targetStack = isNew && stackId ? (stacks.find((s) => s.id === stackId) ?? null) : null;
  // Only ever called in create mode, where the guard below has already proved `targetStack`.
  const onCreate = (input: HabitCreate) => {
    if (targetStack) void createHabitInStack(input, targetStack.id);
  };

  // The stack this act belongs to (editor.tsx is never opened for an unanchored habit — see
  // `HabitEditorScreen`'s doc comment) + a handler to edit that stack.
  const stackName = habit?.stack_id ? (stacks.find((s) => s.id === habit.stack_id)?.name ?? null) : null;
  const openStackActions = useStackActions();
  const onEditStack = habit && habit.stack_id ? () => openStackActions(habit.stack_id!) : undefined;

  // Normalized names of the *other* habits — the form rejects a name that
  // collides with one of these, so the user can't create an indistinguishable
  // duplicate (there's no DB uniqueness backing the name). The habit being
  // edited is excluded so keeping its own name is fine.
  const existingNames = useMemo(() => otherNames(habits, id), [habits, id]);

  // Editing an act that no longer exists (stale deep link / deleted elsewhere), or creating with
  // no stack to land in (a stack deleted mid-flow): back out rather than render a form that can't
  // commit.
  const stale = isNew ? !targetStack : !habit;
  useBackIfStale(stale);
  if (stale) return null;

  return (
    <HabitEditorForm
      habit={habit}
      existingNames={existingNames}
      stackName={stackName}
      onEditStack={onEditStack}
      onClose={() => router.back()}
      onCreate={onCreate}
      onSave={updateHabit}
      onDelete={deleteHabit}
    />
  );
}
