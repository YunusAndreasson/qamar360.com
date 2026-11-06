/**
 * The app's last-resort screen, exported as `ErrorBoundary` from `app/_layout.tsx`: expo-router
 * renders it in place of the root layout when the tree throws while rendering. Without it a render
 * error in a release build closes the app, or leaves the splash up when it throws before the first
 * frame, and nobody hears about it.
 *
 * It renders outside every provider the layout mounts, so it brings its own safe-area provider,
 * reads only what needs no provider (`useTheme` follows the device and the stored preference) and
 * hides the splash itself. "Try again" renders the tree again. A second failure within ten seconds
 * is the same failure, so the screen then offers a restart instead (`recoveryFor`), which also
 * boots an update that has downloaded since launch.
 */
import { reloadAppAsync } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import { reloadAsync } from 'expo-updates';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { EmptyState } from '@/components/empty-state';
import { useTheme } from '@/hooks/use-theme';
import { recoveryFor, type Recovery } from '@/lib/error-recovery';

import type { ErrorBoundaryProps } from 'expo-router';

/** When "Try again" was last pressed. Module state: the router mounts a new boundary per failure. */
let lastRetryAt: number | null = null;

const COPY: Record<Recovery, { title: string; body?: string; action: string }> = {
  retry: { title: 'Something went wrong', action: 'Try again' },
  restart: { title: 'It went wrong again', body: 'Restarting loads the app afresh.', action: 'Restart' },
};

export function AppErrorBoundary(props: ErrorBoundaryProps) {
  const { error } = props;
  useEffect(() => {
    SplashScreen.hide();
    // The router catches render errors itself, so no global handler sees them.
    console.error('[app] render error', error);
  }, [error]);

  return (
    <SafeAreaProvider>
      <ErrorScreen {...props} />
    </SafeAreaProvider>
  );
}

function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [recovery] = useState(() => recoveryFor(lastRetryAt, Date.now()));
  const [busy, setBusy] = useState(false);
  const [restartFailed, setRestartFailed] = useState(false);
  const copy = COPY[recovery];

  const onPress = () => {
    setBusy(true);
    if (recovery === 'retry') {
      lastRetryAt = Date.now();
      void retry().finally(() => setBusy(false));
      return;
    }
    // `reloadAsync` throws where updates are off (a development build); `reloadAppAsync` covers it.
    void reloadAsync()
      .catch(() => reloadAppAsync('The error screen asked for a restart'))
      .catch(() => {
        setBusy(false);
        setRestartFailed(true);
      });
  };

  // A developer gets the message; a user gets what to do about it.
  const body = restartFailed ? 'Could not restart. Close and reopen the app.' : __DEV__ ? error.message : copy.body;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <EmptyState title={copy.title} body={body}>
        <AppButton onPress={onPress} busy={busy}>
          {copy.action}
        </AppButton>
      </EmptyState>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
});
