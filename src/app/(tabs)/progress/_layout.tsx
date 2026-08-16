import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { formSheetOptions, transparentScreen } from '@/lib/header-options';

/** The Month tab's native Stack over the shared fixed sky — large title that collapses on scroll. */
export default function ProgressStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Progress', headerLargeTitle: true }} />
      {/* The hero's key. A sheet rather than a pushed screen because it is a reading of what is
          already on screen behind it — three figures and a sentence — and dismissing it should
          return you to the orbit, not unwind a navigation. */}
      <Stack.Screen name="orbit" options={formSheetOptions(theme)} />
    </TabStack>
  );
}
