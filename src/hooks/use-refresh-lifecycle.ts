import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, type RefObject } from 'react';
import { AppState } from 'react-native';

import { todayLocalISO } from '@/lib/dates';

/**
 * The refresh lifecycle every "read-only history" hook shares (`useProgress`, `useHabitStats`):
 * preload once on mount, clearing `loading` when it lands; refetch silently on focus, so ticks
 * made elsewhere show up on return; and refetch on a day rollover while the screen sits
 * backgrounded, since focus won't fire for that. `fetchData` is expected to dedupe its own
 * concurrent calls (a mount preload and an immediate focus can race).
 */
export function useRefreshLifecycle(
  userId: string | null,
  fetchData: () => Promise<void>,
  todayRef: RefObject<string>,
  setLoading: (loading: boolean) => void,
) {
  // Preload on mount. Under NativeTabs every tab screen is mounted eagerly (all tabs pre-render
  // and never unmount), so this fetch runs in the background the moment the user enters the
  // tabs. By the time the screen is actually opened the data (and its one-time entrance
  // animation) is already settled, so it pops with content instead of a skeleton.
  // https://docs.expo.dev/router/advanced/native-tabs/
  useEffect(() => {
    let active = true;
    void (async () => {
      await fetchData();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchData, setLoading]);

  // Refetch on focus so ticks made elsewhere appear on return. Silent — the mount preload owns
  // the one-time loading gate, so this never re-shows the skeleton.
  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData]),
  );

  // Day rollover while the screen stays focused in the background (focus won't fire).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !userId) return;
      if (todayLocalISO() !== todayRef.current) void fetchData();
    });
    return () => sub.remove();
  }, [userId, fetchData, todayRef]);
}
