import { Stack } from 'expo-router';

import { HabitsProvider } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { stackHeaderOptions } from '@/lib/header-options';

/**
 * The Habits tab's own native Stack. Native tabs render no header, so each tab
 * nests a Stack to get a native large-title bar. `HabitsProvider` wraps the
 * Stack (not just the list) so the editor modal route shares the same habit
 * state and the list survives a round-trip to the sheet.
 *
 * `headerLargeTitle` is set per-screen (on `index`), not here — leaving it in
 * `screenOptions` would give the pushed modal a phantom large-title block.
 */
export default function HabitsStackLayout() {
  const theme = useTheme();
  return (
    <HabitsProvider>
      <Stack screenOptions={stackHeaderOptions(theme)}>
        <Stack.Screen name="index" />
        {/* The single "add a habit" entry: create your own, or add from the curated
            Sunnah library — a pushed sub-screen (native back). */}
        <Stack.Screen name="discover" options={{ title: 'New Habit', headerLargeTitle: true }} />
        {/* New / edit habit — a native modal sheet; Cancel/Save live in its nav bar.
            Theme the modal's nav bar explicitly: iOS modals don't get the glass
            large-title treatment, so without this the bar renders white in dark mode. */}
        <Stack.Screen
          name="editor"
          options={{ presentation: 'modal', headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text }}
        />
        {/* New / edit a stack (a named group of habits) — also a native modal sheet. */}
        <Stack.Screen
          name="stack-editor"
          options={{ presentation: 'modal', headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text }}
        />
      </Stack>
    </HabitsProvider>
  );
}
