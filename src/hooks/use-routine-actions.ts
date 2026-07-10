import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';

import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive } from '@/lib/alerts';
import { haptics } from '@/lib/haptics';

/**
 * Open the "manage routine" menu (rename / delete) for a stack, in each platform's own native
 * idiom: an iOS **action sheet** (`ActionSheetIOS` — the standard affordance for a short list of
 * actions on an item, destructive tinted) and an Android **Material modal bottom sheet** (the
 * `stack-manage` route, a `fitToContents` form sheet). Both hand Rename off to the shared one-field
 * modal (`stack-rename`), so the keyboard never lives inside a sheet. Used by the routine card
 * header (the ⋯) and the habit editor's "edit routine".
 */
export function useRoutineActions() {
  const router = useRouter();
  const { stacks, deleteStack } = useHabits();

  return useCallback(
    (stackId: string) => {
      const stack = stacks.find((s) => s.id === stackId);
      if (!stack) return;

      const openRename = () => router.push({ pathname: '/habits/stack-rename', params: { id: stackId } });
      const confirmDelete = () =>
        confirmDestructive({
          title: 'Delete routine',
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
            options: ['Rename', 'Delete routine', 'Cancel'],
            destructiveButtonIndex: 1,
            cancelButtonIndex: 2,
          },
          (index) => {
            if (index === 0) openRename();
            else if (index === 1) confirmDelete();
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
