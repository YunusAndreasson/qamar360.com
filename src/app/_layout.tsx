import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { PreferencesProvider } from '@/hooks/use-preferences';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { configureNotifications } from '@/lib/notifications';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Set up the foreground handler + Android channel once, before any reminder fires.
  useEffect(() => {
    void configureNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PreferencesProvider>
          <AuthProvider>
            <RootNavigator />
            <ThemedChrome />
          </AuthProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Status-bar contrast + native window background that track the *effective* theme (incl. the
 *  in-app override), so a forced Light/Dark choice doesn't leave the bar or flashes mismatched. */
function ThemedChrome() {
  const scheme = useEffectiveScheme();
  const theme = useTheme();

  useEffect(() => {
    // Match the native window background so theme switches don't flash white behind RN views.
    void SystemUI.setBackgroundColorAsync(theme.background);
  }, [theme.background]);

  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

function RootNavigator() {
  const { session, initialized } = useAuth();

  // Reveal the app once the auth session is known. Gate ONLY on `initialized` — never on the
  // async theme-preference load. Blocking the splash on a second async dependency (AsyncStorage
  // hydration) means any stall there freezes the launch logo with no recovery; a brief theme
  // flash on cold start is the right trade. (PreferencesProvider still hydrates the theme; it
  // just no longer holds the splash hostage.)
  useEffect(() => {
    if (initialized) void SplashScreen.hideAsync();
  }, [initialized]);

  if (!initialized) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
