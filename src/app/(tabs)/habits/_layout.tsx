import { Stack } from 'expo-router';

import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { modalHeaderOptions, transparentScreen } from '@/lib/header-options';

/**
 * The Today tab's native Stack, laid over the shared fixed sky (see {@link TabStack}).
 * `HabitsProvider` lives at the (tabs) root (so the tab bar's badge shares this state); the
 * editor/stack-editor modal routes here are its descendants, so they keep the same habit state
 * and the list survives a round-trip to the sheet.
 *
 * `headerLargeTitle` is set per-screen (on `index`, in its body), not here — leaving it in
 * `screenOptions` would give the pushed modal a phantom large-title block.
 */
export default function HabitsStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      {/* Transparent so the fixed sky behind the stack shows through the (transparent) list. */}
      <Stack.Screen name="index" options={transparentScreen} />
      {/* The single add entry: search/filter the curated Sunnah library or create your own —
          a pushed sub-screen (native back) with a centered "Add Habit" title and a native
          search bar; the pinned chips sit below it. */}
      <Stack.Screen name="discover" options={{ title: 'Add Habit' }} />
      {/* New / edit habit — a native modal sheet; Cancel/Save live in its nav bar. */}
      <Stack.Screen name="editor" options={modalHeaderOptions(theme)} />
      {/* Create a routine (a named group of habits) — a native modal sheet. */}
      <Stack.Screen name="stack-editor" options={modalHeaderOptions(theme)} />
      {/* Rename a routine — the one-field modal the manage sheet's Rename action opens. */}
      <Stack.Screen name="stack-rename" options={modalHeaderOptions(theme)} />
      {/* "Add to routine" picker for a lone habit — a native form sheet sized to its content
          (a short list of routines), dismissed by the grabber or a swipe-down. No nav bar: the
          sheet carries its own compact title. */}
      <Stack.Screen
        name="add-to-routine"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: theme.background },
        }}
      />
      {/* "Manage routine" (rename / delete) for a routine card — the same fitToContents bottom
          sheet idiom as "Add to routine", raised by tapping the card header. */}
      <Stack.Screen
        name="stack-manage"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: theme.background },
        }}
      />
    </TabStack>
  );
}
