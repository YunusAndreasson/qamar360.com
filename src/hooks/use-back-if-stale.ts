import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Pops the current screen once `stale` goes true — the record it was opened for (a habit, a
 * stack, a preset) vanished elsewhere while this modal was open, or a create-mode target never
 * existed. Shared by every params-driven sheet/modal in the Habits stack.
 */
export function useBackIfStale(stale: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (stale) router.back();
  }, [stale, router]);
}
