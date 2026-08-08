import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormSheet, SheetRow } from '@/components/form-sheet';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabits } from '@/hooks/use-habits';
import { useConfirmDeleteStack } from '@/hooks/use-stack-actions';

/**
 * "Manage stack" — a native bottom sheet raised by tapping a stack card's header (the ⋯). It
 * holds the things you can't do to a stack by direct manipulation on Today: add acts to it,
 * edit it (name + moment anchor), or delete it (acts are reordered by dragging them on the card).
 * Presented `fitToContents` from the habits stack layout — the same compact sheet-of-rows as
 * "Add to stack". Add acts and Edit stack hand off to their own modals so no keyboard or list has
 * to live inside the sheet.
 */
export default function StackManageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { stacks } = useHabits();
  const confirmDeleteStack = useConfirmDeleteStack();

  const stack = stacks.find((s) => s.id === id) ?? null;

  // Managing a stack that no longer exists (deleted here or elsewhere): close. `stack` is
  // narrowed non-null for the rest of the component from here on.
  useBackIfStale(!!id && !stack);
  if (!stack) return null;

  // `replace` (not push) so the next modal's Save/Close returns to the list, not back to
  // this sheet.
  const addActs = () => {
    router.replace({ pathname: '/habits/discover', params: { stackId: stack.id } });
  };

  const rename = () => {
    router.replace({ pathname: '/habits/stack-rename', params: { id: stack.id } });
  };

  // The prompt (and the "…and its acts?" question a populated stack raises) is shared with the
  // iOS action sheet. Deleting drops the stack from state; the effect above backs the sheet out
  // (don't also router.back() here, or it pops twice).
  const confirmDelete = () => confirmDeleteStack(stack.id);

  return (
    <FormSheet title={stack.name} subtitle="Stack">
      <Surface>
        <SheetRow icon="add" label="Add acts" onPress={addActs} />
        <RowSeparator />
        <SheetRow icon="edit" label="Edit stack" onPress={rename} />
        <RowSeparator />
        <SheetRow icon="delete" label="Delete stack" danger onPress={confirmDelete} />
      </Surface>
    </FormSheet>
  );
}
