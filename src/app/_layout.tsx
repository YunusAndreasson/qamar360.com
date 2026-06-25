import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
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
  const scheme = useEffectiveScheme();
  const theme = useTheme();

  // Splash stays up (it covers this branch) until the session is known, then hides.
  // `initialized` is guaranteed to flip within ~2.5s by AuthProvider's safety-net
  // timeout, so this never sticks even if getSession() hangs.
  useEffect(() => {
    if (initialized) SplashScreen.hide();
  }, [initialized]);

  if (!initialized) return null;

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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
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
