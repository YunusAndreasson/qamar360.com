import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';

import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive } from '@/lib/alerts';
import { haptics } from '@/lib/haptics';

/**
 * Open the "manage stack" menu (add habits / rename / delete) for a stack, in each platform's
 * own native idiom: an iOS **action sheet** (`ActionSheetIOS` — the standard affordance for a
 * short list of actions on an item, destructive tinted) and an Android **Material modal bottom
 * sheet** (the `stack-manage` route, a `fitToContents` form sheet). Both hand Add habits off to
 * the stack-scoped Add screen and Rename to the shared one-field modal (`stack-rename`), so the
 * keyboard never lives inside a sheet. Used by the stack card header (the ⋯) and the habit
 * editor's "edit stack".
 */
export function useStackActions() {
  const router = useRouter();
  const { stacks, deleteStack } = useHabits();

  return useCallback(
    (stackId: string) => {
      const stack = stacks.find((s) => s.id === stackId);
      if (!stack) return;

      const openAddHabits = () => router.push({ pathname: '/habits/discover', params: { stackId } });
      const openRename = () => router.push({ pathname: '/habits/stack-rename', params: { id: stackId } });
      const confirmDelete = () =>
        confirmDestructive({
          title: 'Delete stack',
          message: `Delete “${stack.name}”? The habits stay; only the grouping is removed.`,
          onConfirm: () => {
            haptics.removed();
            void deleteStack(stackId);
          },
        });

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: stack.name,
            options: ['Add habits', 'Rename', 'Delete stack', 'Cancel'],
            destructiveButtonIndex: 2,
            cancelButtonIndex: 3,
          },
          (index) => {
            if (index === 0) openAddHabits();
            else if (index === 1) openRename();
            else if (index === 2) confirmDelete();
          },
        );
        return;
      }

      // Android: a Material bottom sheet of the same two actions (see `stack-manage`).
      router.push({ pathname: '/habits/stack-manage', params: { id: stackId } });
    },
    [router, stacks, deleteStack],
  );
}
