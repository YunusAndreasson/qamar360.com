import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { FormSheet, SheetRow } from '@/components/form-sheet';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive } from '@/lib/alerts';
import { haptics } from '@/lib/haptics';

/**
 * "Manage stack" — a native bottom sheet raised by tapping a stack card's header (the ⋯). It
 * holds the things you can't do to a stack by direct manipulation on Today: add habits to it,
 * edit it (name + time-of-day anchor), or delete it (members are removed/reordered by dragging
 * the card). Presented `fitToContents` from the habits stack layout — the same compact
 * sheet-of-rows as "Add to stack". Add habits and Edit stack hand off to their own modals so
 * no keyboard or list has to live inside the sheet.
 */
export default function StackManageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { stacks, deleteStack } = useHabits();

  const stack = stacks.find((s) => s.id === id) ?? null;

  // `replace` (not push) so the next modal's Save/Close returns to the list, not back to
  // this sheet.
  const addHabits = () => {
    if (!stack) return;
    router.replace({ pathname: '/habits/discover', params: { stackId: stack.id } });
  };

  const rename = () => {
    if (!stack) return;
    router.replace({ pathname: '/habits/stack-rename', params: { id: stack.id } });
  };

  const confirmDelete = () => {
    if (!stack) return;
    // Deleting drops the stack from state; the effect below backs the sheet out (don't also
    // router.back() here, or it pops twice).
    confirmDestructive({
      title: 'Delete stack',
      message: `Delete “${stack.name}”? The habits stay; only the grouping is removed.`,
      onConfirm: () => {
        haptics.removed();
        void deleteStack(stack.id);
      },
    });
  };

  // Managing a stack that no longer exists (deleted here or elsewhere): close.
  useEffect(() => {
    if (id && !stack) router.back();
  }, [id, stack, router]);
  if (!stack) return null;

  return (
    <FormSheet title={stack.name} subtitle="Stack">
      <Surface>
        <SheetRow icon="add" label="Add habits" onPress={addHabits} />
        <RowSeparator />
        <SheetRow icon="edit" label="Edit stack" onPress={rename} />
        <RowSeparator />
        <SheetRow icon="delete" label="Delete stack" danger onPress={confirmDelete} />
      </Surface>
    </FormSheet>
  );
}
