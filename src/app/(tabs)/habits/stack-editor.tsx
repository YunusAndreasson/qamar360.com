import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { StackEditorForm } from '@/components/stack-editor-form';
import { useHabits } from '@/hooks/use-habits';
import { otherNames } from '@/lib/names';

/**
 * Create a routine — a native modal sheet. Reached with `id="new"`, optionally seeded with a
 * `seed` habit id to start the routine from. Editing an existing routine (rename / delete) lives in
 * the manage sheet (`habits/stack-manage`), and its members are added/removed/reordered by dragging
 * the card — so none of that happens here. Save/Cancel `router.back()` to the list.
 */
export default function StackEditorScreen() {
  const router = useRouter();
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  const { habits, stacks, createStack } = useHabits();

  // A new routine starts empty, or seeded with the one habit it was created from.
  const initialMemberIds = useMemo(() => (seed ? [seed] : []), [seed]);
  // Existing routines' names — the form rejects a colliding name.
  const existingNames = useMemo(() => otherNames(stacks), [stacks]);

  return (
    <StackEditorForm
      habits={habits}
      initialMemberIds={initialMemberIds}
      existingNames={existingNames}
      onClose={() => router.back()}
      onCreate={createStack}
    />
  );
}
