import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useReducer, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { PreferencesProvider, usePreferences } from '@/hooks/use-preferences';
import { configureNotifications } from '@/lib/notifications';

// ⚠️ TEMPORARY DIAGNOSTIC BUILD — instrumentation to locate the iOS launch freeze.
// Revert before shipping. It hides the native splash immediately and renders the
// live startup state so the screen itself reports what is stuck.

void SplashScreen.preventAutoHideAsync();

// Capture any fatal/global JS error (async or outside render) so the screen can show it.
let globalError: string | null = null;
const EU = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler?: () => unknown; setGlobalHandler?: (h: unknown) => void } }).ErrorUtils;
const prevHandler = EU?.getGlobalHandler?.() as ((e: Error, fatal: boolean) => void) | undefined;
EU?.setGlobalHandler?.((e: Error, isFatal: boolean) => {
  globalError = `[global${isFatal ? ' FATAL' : ''}] ${e?.message}\n${e?.stack ?? ''}`;
  prevHandler?.(e, isFatal);
});

function DiagScreen({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0B0E1A', paddingHorizontal: 20, paddingTop: 72 }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 }}>DIAG · {title}</Text>
      <ScrollView>
        <Text selectable style={{ color: '#9fe7ff', fontSize: 13, lineHeight: 19 }}>{body}</Text>
      </ScrollView>
    </View>
  );
}

class DiagBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <DiagScreen title="RENDER CRASH" body={String(this.state.error.stack ?? this.state.error)} />;
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  // DIAGNOSTIC: hide the native splash immediately, unconditionally, so we always
  // see the JS UI. If the logo still stays, JS never reached this point.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    void configureNotifications();
  }, []);

  return (
    <DiagBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <PreferencesProvider>
            <AuthProvider>
              <DiagGate />
            </AuthProvider>
          </PreferencesProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </DiagBoundary>
  );
}

function DiagGate() {
  const { session, initialized } = useAuth();
  const { hydrated } = usePreferences();
  const [tick, beat] = useReducer((n: number) => n + 1, 0);
  const [t0] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(beat, 500);
    return () => clearInterval(id);
  }, []);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const body =
    `heartbeat: ${tick}   elapsed: ${elapsed}s\n\n` +
    `initialized: ${initialized}\n` +
    `session: ${session ? 'present' : 'null'}\n` +
    `hydrated: ${hydrated}\n\n` +
    (globalError ? `GLOBAL ERROR:\n${globalError}` : '(no global error captured)');

  // The real freeze case: gate never opens. Show the live state instead of a blank logo.
  if (!initialized) return <DiagScreen title="GATE — init=false" body={body} />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
