import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { formSheetOptions, transparentScreen } from '@/lib/header-options';

/** The Settings tab's native Stack over the shared fixed sky — large title that collapses on scroll. */
export default function SettingsStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Settings', headerLargeTitleEnabled: true }} />
      {/* Pushed sub-screen; title + Save live in the screen's own <Stack.Screen>. Stays opaque
          (no transparentScreen) — a plain form over the themed background. */}
      <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
      {/* The two guides — the app's method, in the tab where you go looking for it rather than
          only where you'd act on it. Registered here as well as under Today so reaching one from
          Settings never switches tabs. Plain pushed screens: each carries a photograph and four
          sections, and each sets its own title from the guide data. */}
      <Stack.Screen name="stacking-info" />
      <Stack.Screen name="exchange-info" />
      {/* The two settings that need more than a switch: each is a compact picker over one
          value, so it's a sheet rather than a pushed screen — the list stays one level deep. */}
      <Stack.Screen name="hijri-adjust" options={formSheetOptions(theme)} />
      <Stack.Screen name="day-times" options={formSheetOptions(theme)} />
      {/* Explains the four lunar updates before the OS prompt — see the screen's own note on
          why the ask is primed rather than fired straight from the switch. */}
      <Stack.Screen name="lunar-updates" options={formSheetOptions(theme)} />
      {/* The account photo's two verbs, behind the avatar at the head of the list — a sheet for
          the same reason the pickers above are one: it is a short menu over one thing. */}
      <Stack.Screen name="photo" options={formSheetOptions(theme)} />
    </TabStack>
  );
}
