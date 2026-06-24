import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { stackHeaderOptions } from '@/lib/header-options';

/** The Settings tab's native Stack — large title that collapses on scroll. */
export default function SettingsStackLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={stackHeaderOptions(theme)}>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitle: true }} />
      {/* Pushed sub-screen; title + Save live in the screen's own <Stack.Screen>. */}
      <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
    </Stack>
  );
}
