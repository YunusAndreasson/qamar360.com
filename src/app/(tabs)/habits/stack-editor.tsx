import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { StackEditorForm } from '@/components/stack-editor-form';
import { useHabits } from '@/hooks/use-habits';
import { otherNames } from '@/lib/names';

/**
 * One params-driven screen for both new and edit, a native modal sheet of the Habits
 * Stack. `id="new"` creates (optionally seeded with a `seed` habit id); any other id
 * edits that stack. Save/Delete (and Cancel) `router.back()` to the list.
 */
export default function StackEditorScreen() {
  const router = useRouter();
  const { id, seed } = useLocalSearchParams<{ id?: string; seed?: string }>();
  const { habits, stacks, createStack, updateStack, deleteStack } = useHabits();

  const isNew = !id || id === 'new';
  const stack = isNew ? null : (stacks.find((s) => s.id === id) ?? null);

  // Members in sequence order (by position). For a new stack, an optional seed habit.
  const initialMemberIds = useMemo(() => {
    if (isNew) return seed ? [seed] : [];
    return habits
      .filter((h) => h.stack_id === id)
      .sort((a, b) => a.position - b.position)
      .map((h) => h.id);
  }, [isNew, seed, habits, id]);

  // Other stacks' names — the form rejects a colliding name.
  const existingNames = useMemo(() => otherNames(stacks, id), [stacks, id]);

  // Editing a stack that no longer exists (deleted here or elsewhere): back out.
  useEffect(() => {
    if (!isNew && !stack) router.back();
  }, [isNew, stack, router]);
  if (!isNew && !stack) return null;

  return (
    <StackEditorForm
      stack={stack}
      habits={habits}
      initialMemberIds={initialMemberIds}
      existingNames={existingNames}
      onClose={() => router.back()}
      onCreate={createStack}
      onSave={updateStack}
      onDelete={deleteStack}
    />
  );
}
