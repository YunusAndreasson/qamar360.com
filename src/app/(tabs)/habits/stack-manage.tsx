import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabits } from '@/hooks/use-habits';
import { useConfirmDeleteStack } from '@/hooks/use-stack-actions';

/**
 * "Manage stack" — the native bottom sheet the card's "Manage stack" row raises. It holds the
 * things you can't do to a stack by direct manipulation on Today: add acts to it, read its
 * history, edit it (name + moment anchor), or delete it (acts are reordered by dragging them on
 * the card). Presented `fitToContents` from the habits stack layout.
 *
 * It is deliberately the *same object* as an act's or an exchange's sheet (`act-actions`): the
 * same `FormSheet` heading, the same {@link SheetActions} card, and Insights in the same slot —
 * second, under whatever the sheet's stateful first row happens to be. A stack and an exchange are
 * the two things this app tracks, and the same gesture on them has to answer in the same voice.
 *
 * Add acts and Edit stack hand off to their own modals so no keyboard or list has to live inside
 * the sheet.
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

  const openInsights = () => {
    router.replace({ pathname: '/habits/stack-stats', params: { id: stack.id } });
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
      <SheetActions
        actions={[
          { icon: 'add', label: 'Add acts', onPress: addActs },
          { icon: 'insights', label: 'Insights', onPress: openInsights },
          { icon: 'edit', label: 'Edit stack', onPress: rename },
          { icon: 'delete', label: 'Delete stack', danger: true, onPress: confirmDelete },
        ]}
      />
    </FormSheet>
  );
}
