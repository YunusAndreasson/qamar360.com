import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { formSheetOptions, transparentScreen } from '@/lib/header-options';

export default function InsightsStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Insights', headerLargeTitle: true }} />
      {/* The reading in full — pushed, not a sheet: it has more to say than `fitToContents` can
          hold, and it is a place you arrive at from a notification, not a footnote to this screen. */}
      <Stack.Screen name="[id]" options={transparentScreen} />
      <Stack.Screen name="orbit" options={formSheetOptions(theme)} />
    </TabStack>
  );
}
