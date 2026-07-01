import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * Pull-to-refresh wiring shared by the Today and Progress lists: the `refreshing` state, an
 * `onRefresh` that runs the passed (silent) refetch, and a themed `RefreshControl` ready to hand
 * to a ScrollView / FlatList. One definition so both screens spin the same indicator in the same
 * colours instead of re-declaring the handler and the control side by side.
 */
export function usePullToRefresh(refresh: () => Promise<void>) {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={theme.textSecondary}
      colors={[theme.accent]}
      progressBackgroundColor={theme.backgroundElement}
    />
  );

  return { refreshControl };
}
