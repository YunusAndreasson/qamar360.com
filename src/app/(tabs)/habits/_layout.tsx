import { Stack } from 'expo-router';

import { HabitsProvider } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { modalHeaderOptions, stackHeaderOptions } from '@/lib/header-options';

/**
 * The Today tab's own native Stack. Native tabs render no header, so each tab
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
        {/* The single add entry: search/filter the curated Sunnah library or create your
            own — a pushed sub-screen (native back). Uses a standard header so its own
            two-line title + pinned search/chips sit in-body (a native large title can't
            host them, nor take forced line breaks); discover.tsx hides the centre title. */}
        <Stack.Screen name="discover" options={{ title: 'Add' }} />
        {/* New / edit habit — a native modal sheet; Cancel/Save live in its nav bar. */}
        <Stack.Screen name="editor" options={modalHeaderOptions(theme)} />
        {/* New / edit a stack (a named group of habits) — also a native modal sheet. */}
        <Stack.Screen name="stack-editor" options={modalHeaderOptions(theme)} />
      </Stack>
    </HabitsProvider>
  );
}
