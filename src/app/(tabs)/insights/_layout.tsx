import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { modalHeaderOptions, transparentScreen } from '@/lib/header-options';

export default function InsightsStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Insights', headerLargeTitle: true }} />
      {/* The reading in full — pushed, not a sheet: it has more to say than `fitToContents` can
          hold, and it is a place you arrive at from a notification, not a footnote to this screen. */}
      <Stack.Screen name="[id]" options={transparentScreen} />
      {/* A goal, and the form that sets one. Under a static `goal/` segment rather than beside
          `[id]`, so neither route can ever be swallowed by the reading's dynamic one. */}
      <Stack.Screen name="goal/[id]" options={transparentScreen} />
      {/* The composer takes `modalHeaderOptions`, the same as every other editor form in the app
          (`habits/_layout.tsx`) — an opaque themed bar in the shared title voice. Not
          `transparentScreen`: that exists so a *list* can show the fixed sky through it, and
          `FormScreen` paints its own background and its own backdrop already. */}
      <Stack.Screen name="goal/new" options={modalHeaderOptions(theme)} />
    </TabStack>
  );
}
