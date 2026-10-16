import { useRouter } from 'expo-router';
import { useCallback } from 'react';

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
            ? `Delete “${stack.name}”? Its one act can stay, needing a new anchor, or be deleted with it.`
            : `Delete “${stack.name}”? Its ${count} acts can stay, needing a new anchor, or be deleted with it.`,
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
 * Open the "manage stack" sheet (add acts / stats / edit / delete) — the `stack-manage` route,
 * a `fitToContents` form sheet. Used by the stack card's "Manage stack" row (the ⋯ at the foot of
 * the fold) and the act editor's "edit stack".
 *
 * It used to fork on platform: an `ActionSheetIOS` on iOS, the sheet only on Android. But an act
 * and an exchange raise the *same* sheet on both platforms (`act-actions`), and a stack is the
 * other thing this app tracks — the same gesture on the two units has to produce the same object,
 * or one of them looks like the afterthought. The sheet is also the only one of the two that can
 * carry Stats, which an action sheet's short list of verbs has no room to mean.
 */
export function useStackActions() {
  const router = useRouter();

  return useCallback(
    (stackId: string) => router.push({ pathname: '/habits/stack-manage', params: { id: stackId } }),
    [router],
  );
}
