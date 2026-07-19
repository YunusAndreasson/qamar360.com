import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { formSheetOptions, transparentScreen } from '@/lib/header-options';

/** The Settings tab's native Stack over the shared fixed sky — large title that collapses on scroll. */
export default function SettingsStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Settings', headerLargeTitle: true }} />
      {/* Pushed sub-screen; title + Save live in the screen's own <Stack.Screen>. Stays opaque
          (no transparentScreen) — a plain form over the themed background. */}
      <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
      {/* The habit-stacking guide — the same sheet the Today hint opens, registered here too so
          reaching it from Settings never switches tabs. */}
      <Stack.Screen name="stacking-info" options={formSheetOptions(theme)} />
      {/* The two settings that need more than a switch: each is a compact picker over one
          value, so it's a sheet rather than a pushed screen — the list stays one level deep. */}
      <Stack.Screen name="hijri-adjust" options={formSheetOptions(theme)} />
      <Stack.Screen name="day-times" options={formSheetOptions(theme)} />
    </TabStack>
  );
}
