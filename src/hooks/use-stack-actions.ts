import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';

import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive, confirmDestructiveChoice } from '@/lib/alerts';
import { haptics } from '@/lib/haptics';

/**
 * The "delete this stack" prompt — one definition, so both platforms' manage menus ask the same
 * question in the same words.
 *
 * A stack that still holds acts asks a second one, because the answer isn't always the same: the
 * acts can outlive their anchor (they're deeds, and a deed can move house) or go down with it
 * when a whole routine is being retired. Only the second is tinted destructive — it's the one
 * that takes history with it.
 */
export function useConfirmDeleteStack() {
  const { habits, stacks, deleteStack } = useHabits();

  return useCallback(
    (stackId: string) => {
      const stack = stacks.find((s) => s.id === stackId);
      if (!stack) return;
      const count = habits.filter((h) => h.stack_id === stackId).length;
      const remove = (withActs: boolean) => {
        // The soft "release" — destruction always confirms with the same texture.
        haptics.removed();
        void deleteStack(stackId, { withActs });
      };

      if (count === 0) {
        confirmDestructive({
          title: 'Delete stack',
          message: `Delete “${stack.name}”? It holds no acts.`,
          onConfirm: () => remove(false),
        });
        return;
      }

      confirmDestructiveChoice({
        title: 'Delete stack',
        message:
          count === 1
            ? `Delete “${stack.name}”? Its one act can stay — it’ll need a new anchor — or be deleted with it.`
            : `Delete “${stack.name}”? Its ${count} acts can stay — they’ll need a new anchor — or be deleted with it.`,
        keepLabel: count === 1 ? 'Keep the act' : 'Keep the acts',
        onKeep: () => remove(false),
        destroyLabel: count === 1 ? 'Delete the act too' : 'Delete the acts too',
        onDestroy: () => remove(true),
      });
    },
    [habits, stacks, deleteStack],
  );
}

/**
 * Open the "manage stack" menu (add acts / edit / delete) for a stack, in each platform's
 * own native idiom: an iOS **action sheet** (`ActionSheetIOS` — the standard affordance for a
 * short list of actions on an item, destructive tinted) and an Android **Material modal bottom
 * sheet** (the `stack-manage` route, a `fitToContents` form sheet). Both hand Add acts off to
 * the stack-scoped Add screen and Edit stack (name + time-of-day anchor) to the shared modal
 * (`stack-rename`), so the keyboard never lives inside a sheet. Used by the stack card header
 * (the ⋯) and the act editor's "edit stack".
 */
export function useStackActions() {
  const router = useRouter();
  const { stacks } = useHabits();
  const confirmDeleteStack = useConfirmDeleteStack();

  return useCallback(
    (stackId: string) => {
      const stack = stacks.find((s) => s.id === stackId);
      if (!stack) return;

      const openAddActs = () => router.push({ pathname: '/habits/discover', params: { stackId } });
      const openRename = () => router.push({ pathname: '/habits/stack-rename', params: { id: stackId } });

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: stack.name,
            options: ['Add acts', 'Edit stack', 'Delete stack', 'Cancel'],
            destructiveButtonIndex: 2,
            cancelButtonIndex: 3,
          },
          (index) => {
            if (index === 0) openAddActs();
            else if (index === 1) openRename();
            else if (index === 2) confirmDeleteStack(stackId);
          },
        );
        return;
      }

      // Android: a Material bottom sheet of the same two actions (see `stack-manage`).
      router.push({ pathname: '/habits/stack-manage', params: { id: stackId } });
    },
    [router, stacks, confirmDeleteStack],
  );
}
