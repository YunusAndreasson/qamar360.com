import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { transparentScreen } from '@/lib/header-options';

/** The Month tab's native Stack over the shared fixed sky — large title that collapses on scroll. */
export default function ProgressStackLayout() {
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Progress', headerLargeTitle: true }} />
    </TabStack>
  );
}
