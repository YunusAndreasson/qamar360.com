import { Stack, useRouter } from 'expo-router';

import { headerCloseAction } from '@/components/form-header-actions';
import { TabStack } from '@/components/tab-stack';
import { useTheme } from '@/hooks/use-theme';
import { formSheetOptions, modalHeaderOptions, transparentScreen } from '@/lib/header-options';

/**
 * The Today tab's native Stack, laid over the shared fixed sky (see {@link TabStack}).
 * `HabitsProvider` lives at the (tabs) root (so the tab bar's badge shares this state); the
 * editor modal and sheet routes here are its descendants, so they keep the same habit state
 * and the list survives a round-trip to the sheet.
 *
 * `headerLargeTitle` is set per-screen (on `index`, in its body), not here — leaving it in
 * `screenOptions` would give the pushed modal a phantom large-title block.
 */
export default function HabitsStackLayout() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <TabStack>
      {/* Transparent so the fixed sky behind the stack shows through the (transparent) list. */}
      <Stack.Screen name="index" options={transparentScreen} />
      {/* The "+" fork: habit or stack — a compact form sheet whose two rows explain the choice. */}
      <Stack.Screen name="add-menu" options={formSheetOptions(theme)} />
      {/* Add a habit: search/filter the curated Sunnah library or create your own — a native
          modal sheet (from the bottom, the same idiom as the editor it sits beside in the empty
          state), with a centered "Add Habit" title, a native search bar, and a left-aligned
          Close; the pinned chips sit below it. With a `stackId` param it adds into that stack. */}
      <Stack.Screen
        name="discover"
        options={{ ...modalHeaderOptions(theme), title: 'Add Habit', headerLeft: headerCloseAction(() => router.back()) }}
      />
      {/* New / edit habit — a native modal sheet; Cancel/Save live in its nav bar. */}
      <Stack.Screen name="editor" options={modalHeaderOptions(theme)} />
      {/* Name a new (empty) stack — the one-field modal the add menu's "New stack" opens. */}
      <Stack.Screen name="stack-new" options={modalHeaderOptions(theme)} />
      {/* Rename a stack — the one-field modal the manage menu's Rename action opens. */}
      <Stack.Screen name="stack-rename" options={modalHeaderOptions(theme)} />
      {/* "Add to stack" picker for a lone habit — a native form sheet sized to its content
          (a short list of existing stacks). */}
      <Stack.Screen name="add-to-stack" options={formSheetOptions(theme)} />
      {/* "Manage stack" (rename / delete) for a stack card — raised by tapping the card header. */}
      <Stack.Screen name="stack-manage" options={formSheetOptions(theme)} />
      {/* The habit-stacking guide — a short educational sheet, opened from the Today hint. */}
      <Stack.Screen name="stacking-info" options={formSheetOptions(theme)} />
    </TabStack>
  );
}
