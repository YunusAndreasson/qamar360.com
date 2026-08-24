import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { transparentScreen } from '@/lib/header-options';

/** The Progress tab's native Stack over the shared fixed sky — large title that collapses on
 *  scroll. One screen: the lines. The orbit and its key moved to Insights with the moon. */
export default function ProgressStackLayout() {
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Progress', headerLargeTitle: true }} />
    </TabStack>
  );
}
