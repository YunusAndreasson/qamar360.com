import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DayCompleteProvider } from '@/components/day-complete';
import { ToastProvider } from '@/components/toast';
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
        <ToastProvider>
          <AuthProvider>
            <CatalogProvider>
              <DayCompleteProvider>
                {/* One gravity sensor and one set of twinkle clocks for every sky in the app —
                    see the note in `use-sky.tsx` on what each screen owning its own used to cost. */}
                <SkyProvider>
                  <RootNavigator />
                  <ThemedChrome />
                </SkyProvider>
              </DayCompleteProvider>
            </CatalogProvider>
          </AuthProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
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
  // same philosophy as AuthProvider's safety-net timeout).
  const [fontsLoaded, fontError] = useFonts(FontAssets);
  const scheme = useEffectiveScheme();
  const theme = useTheme();

  // Splash stays up (it covers this branch) until the session is known and the fonts have
  // settled, then hides. `initialized` is guaranteed to flip within ~2.5s by AuthProvider's
  // safety-net timeout, so this never sticks even if getSession() hangs.
  const ready = initialized && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  // Tapping a lunar update opens the reading it carried, in full — the banner is that reading's
  // first line, so the tap lands on the rest of it rather than somewhere it has to be looked up.
  // An update that carried only the landmark has no id, and opens the feed instead. Gated on a
  // mounted navigator and a session, so a cold-start tap can't navigate before the tabs exist or
  // land a signed-out user on a protected route.
  useEffect(() => {
    if (!ready || !session) return;
    return subscribeToUpdateTaps((readingId) => {
      if (readingId) router.navigate({ pathname: '/(tabs)/insights/[id]', params: { id: readingId } });
      else router.navigate('/insights');
    });
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
