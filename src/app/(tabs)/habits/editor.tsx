import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { HabitEditorForm } from '@/components/habit-editor';
import { useHabits } from '@/hooks/use-habits';
import { useRoutineActions } from '@/hooks/use-routine-actions';
import { otherNames } from '@/lib/names';

/**
 * One params-driven screen for both new and edit, presented as a native modal
 * sheet by the Habits Stack. `id="new"` creates; any other id edits that habit.
 * Save/Delete (and Cancel) just `router.back()` to the list.
 */
export default function HabitEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { habits, stacks, createHabit, updateHabit, deleteHabit, updateStack } = useHabits();

  const isNew = !id || id === 'new';
  const habit = isNew ? null : (habits.find((h) => h.id === id) ?? null);

  // The stack this habit belongs to (if any) + handlers for the editor's STACK picker:
  // edit the current stack, join an existing one, or start a new one seeded with this habit.
  const stackName = habit?.stack_id ? (stacks.find((s) => s.id === habit.stack_id)?.name ?? null) : null;
  const joinableStacks = useMemo(
    () => (habit && !habit.stack_id ? stacks.map((s) => ({ id: s.id, name: s.name })) : []),
    [habit, stacks],
  );
  const onNewStack = habit
    ? () => router.push({ pathname: '/habits/stack-editor', params: { id: 'new', seed: habit.id } })
    : undefined;
  const openRoutineActions = useRoutineActions();
  const onEditStack = habit && habit.stack_id ? () => openRoutineActions(habit.stack_id!) : undefined;
  const onJoinStack = habit
    ? (stackId: string) => {
        const memberIds = habits
          .filter((h) => h.stack_id === stackId)
          .sort((a, b) => a.position - b.position)
          .map((h) => h.id);
        void updateStack(stackId, { orderedMemberIds: [...memberIds, habit.id] });
      }
    : undefined;

  // Normalized names of the *other* habits — the form rejects a name that
  // collides with one of these, so the user can't create an indistinguishable
  // duplicate (there's no DB uniqueness backing the name). The habit being
  // edited is excluded so keeping its own name is fine.
  const existingNames = useMemo(() => otherNames(habits, id), [habits, id]);

  // Editing a habit that no longer exists (stale deep link / deleted elsewhere):
  // back out rather than render an empty form.
  useEffect(() => {
    if (!isNew && !habit) router.back();
  }, [isNew, habit, router]);
  if (!isNew && !habit) return null;

  return (
    <HabitEditorForm
      habit={habit}
      existingNames={existingNames}
      stackName={stackName}
      joinableStacks={joinableStacks}
      onJoinStack={onJoinStack}
      onNewStack={onNewStack}
      onEditStack={onEditStack}
      onClose={() => router.back()}
      onCreate={createHabit}
      onSave={updateHabit}
      onDelete={deleteHabit}
    />
  );
}
