import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { transparentScreen } from '@/lib/header-options';

/** The Settings tab's native Stack over the shared fixed sky — large title that collapses on scroll. */
export default function SettingsStackLayout() {
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Settings', headerLargeTitle: true }} />
      {/* Pushed sub-screen; title + Save live in the screen's own <Stack.Screen>. Stays opaque
          (no transparentScreen) — a plain form over the themed background. */}
      <Stack.Screen name="change-password" options={{ title: 'Change Password' }} />
    </TabStack>
  );
}
