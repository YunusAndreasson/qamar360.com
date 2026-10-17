import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { formSheetOptions, transparentScreen } from '@/lib/header-options';

/** The Progress tab's native Stack over the shared fixed sky: the month's orbit, then the record. */
export default function ProgressStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Progress', headerLargeTitleEnabled: true }} />
      <Stack.Screen name="orbit" options={formSheetOptions(theme)} />
    </TabStack>
  );
}
