import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { transparentScreen } from '@/lib/header-options';

/**
 * The Insights tab's stack: the readings, and nothing else.
 *
 * Goals used to be set from a `+` here and read from a card at the top of the list. They live on
 * Today (set) and in Progress (followed) now — this tab is the written record, and a goal reaches
 * it as evidence the deeper reflection is given rather than as a row of its own.
 */
export default function InsightsStackLayout() {
  return (
    <TabStack>
      <Stack.Screen
        name="index"
        options={{
          ...transparentScreen,
          title: 'Insights',
          headerLargeTitle: true,
        }}
      />
      {/* The reading in full — pushed, not a sheet: it has more to say than `fitToContents` can
          hold, and it is a place you arrive at from a notification, not a footnote to this screen. */}
      <Stack.Screen name="[id]" options={transparentScreen} />
    </TabStack>
  );
}
