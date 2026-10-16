import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { reloadAsync, useUpdates } from 'expo-updates';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MaterialSymbolsFont } from '@/components/app-icon';
import { DayCompleteProvider } from '@/components/day-complete';
import { ToastProvider, useToast } from '@/components/toast';
import { FontAssets } from '@/constants/fonts';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { CatalogProvider } from '@/hooks/use-catalog';
import { SkyProvider } from '@/hooks/use-sky';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { configureNotifications, subscribeToUpdateTaps } from '@/lib/notifications';
import { initPreferences } from '@/lib/preferences';

void SplashScreen.preventAutoHideAsync();

// Push the preferences that plain modules hold as their own state (the Hijri adjustment) before
// anything renders — the very first date the app formats must already carry the user's choice.
initPreferences();

export default function RootLayout() {
  useEffect(() => {
    void configureNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ToastProvider>
            <AuthProvider>
              <CatalogProvider>
                <DayCompleteProvider>
                  {/* One gravity sensor and one set of twinkle clocks for every sky in the app —
                      see the note in `use-sky.tsx` on what each screen owning its own used to cost. */}
                  <SkyProvider>
                    <RootNavigator />
                    <ThemedChrome />
                    <UpdateReady />
                  </SkyProvider>
                </DayCompleteProvider>
              </CatalogProvider>
            </AuthProvider>
          </ToastProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Says so when a downloaded update is waiting, and offers the restart that applies it.
 *
 * `expo-updates` checks on launch and, with `fallbackToCacheTimeout: 10000`, applies what arrives
 * inside ten seconds before the app ever renders — the invisible, correct case. What is left is
 * the slow download: it lands in the background, the running JS is now the old one, and nothing
 * said so. The only way through was to quit the app twice, which is not something a user can be
 * expected to guess.
 *
 * `isUpdatePending`, not `isUpdateAvailable` — pending means the bundle is already on the device,
 * so the restart is instant and works with the network gone. Available only means one exists.
 *
 * Offered rather than applied. Reloading is a cold start: it would take a half-typed to-do or
 * unsaved plan notes with it, and an app that restarts itself under the user's hands to install
 * something they never asked about is the behaviour people turn updates off over. The toast
 * carries the app's own action affordance and self-dismisses; declining costs nothing, because the
 * update applies on the next launch anyway.
 *
 * Fires once per app run: `isUpdatePending` stays true once set, and a repeating toast would be
 * nagging. Silent in development, where nothing is ever pending — `reloadAsync` throws outright
 * there, which is why it is caught rather than fired into the void: the app's rule is that a
 * failed action says so instead of disappearing into an unhandled rejection.
 */
function UpdateReady() {
  const { isUpdatePending } = useUpdates();
  const { show } = useToast();
  const announced = useRef(false);

  useEffect(() => {
    if (!isUpdatePending || announced.current) return;
    announced.current = true;
    show('Update ready', 'success', {
      label: 'Restart',
      onPress: () =>
        void reloadAsync().catch(() => show('Could not restart. Close and reopen the app.', 'danger')),
    });
  }, [isUpdatePending, show]);

  return null;
}

function ThemedChrome() {
  const scheme = useEffectiveScheme();
  const theme = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.background);
  }, [theme.background]);
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

function RootNavigator() {
  const { session, initialized } = useAuth();
  const router = useRouter();
  // Local-asset fonts resolve in milliseconds, well inside the auth gate's splash hold; on a
  // load error the app degrades to the system font rather than deadlocking the splash (the
  // same philosophy as AuthProvider's safety-net timeout). On Android the icon font loads with
  // them, so no glyph ever paints a frame before its font (see `AppIcon`).
  const [fontsLoaded, fontError] = useFonts(Platform.OS === 'android' ? { ...FontAssets, ...MaterialSymbolsFont } : FontAssets);
  const scheme = useEffectiveScheme();
  const theme = useTheme();

  // Splash stays up (it covers this branch) until the session is known and the fonts have
  // settled, then hides. `initialized` is guaranteed to flip within ~2.5s by AuthProvider's
  // safety-net timeout, so this never sticks even if getSession() hangs.
  const ready = initialized && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  // Tapping a lunar update opens Progress: the banner is about the month, and that is where the
  // month is drawn. Gated on a mounted navigator and a session, so a cold-start tap can't navigate
  // before the tabs exist or land a signed-out user on a protected route.
  useEffect(() => {
    if (!ready || !session) return;
    return subscribeToUpdateTaps(() => router.navigate('/progress'));
  }, [ready, session, router]);

  if (!ready) return null;

  // Feed the theme into React Navigation so the navigator container + screen
  // backgrounds are the app's background — otherwise the default theme paints
  // white behind screens during transitions.
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.background,
      card: theme.background,
      text: theme.text,
      border: theme.border,
      primary: theme.accent,
      notification: theme.danger,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      {/* These are auth-gate transitions (open → tabs, sign in/out), not content
          navigation — cross-fade so the app *materialises* instead of sliding in from
          the right. Nested stacks (editor, discover, settings) keep their own push slide. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background }, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
