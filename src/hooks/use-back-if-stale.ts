import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useHabits } from '@/hooks/use-habits';

/**
 * Pops the current screen once `stale` goes true — the record it was opened for (a habit, a
 * stack, a preset) vanished elsewhere while this modal was open, or a create-mode target never
 * existed. Shared by every params-driven sheet/modal in the Habits stack.
 *
 * Never while the habits list is still on its first load: it is empty then (a cold start from a
 * link or notification, or a snapshot seed that was rejected), so every record looks missing and
 * the sheet would close itself over a habit that exists. Callers stay blank until it settles.
 */
export function useBackIfStale(stale: boolean) {
  const router = useRouter();
  const { loading } = useHabits();
  const gone = stale && !loading;
  useEffect(() => {
    if (gone) router.back();
  }, [gone, router]);
}
