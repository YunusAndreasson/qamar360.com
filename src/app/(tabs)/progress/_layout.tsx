import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { formSheetOptions, modalHeaderOptions, transparentScreen } from '@/lib/header-options';

/** The Progress tab's native Stack over the shared fixed sky: current orbit, the record, then
 *  the goals — the one instrument here measured in the user's own units rather than in degrees. */
export default function ProgressStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ ...transparentScreen, title: 'Progress', headerLargeTitle: true }} />
      <Stack.Screen name="orbit" options={formSheetOptions(theme)} />
      {/* One goal in full. Under a static `goal/` segment for the reason it was under one in the
          Insights stack: neither route can then be swallowed by a sibling's dynamic one. */}
      <Stack.Screen name="goal/[id]" options={transparentScreen} />
      {/* The composer takes `modalHeaderOptions`, the same as every other editor form in the app
          (`habits/_layout.tsx`) — an opaque themed bar in the shared title voice. Not
          `transparentScreen`: that exists so a *list* can show the fixed sky through it, and
          `FormScreen` paints its own background and its own backdrop already. The same component
          is mounted at `habits/goal-new` for setting one; this route only ever edits. */}
      <Stack.Screen name="goal/edit" options={modalHeaderOptions(theme)} />
    </TabStack>
  );
}
