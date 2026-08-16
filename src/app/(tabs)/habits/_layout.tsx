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
      {/* The "+" fork: stack, exchange, or a one-off task — a compact form sheet whose three cards
          name the noun each one makes. */}
      <Stack.Screen name="add-menu" options={formSheetOptions(theme)} />
      {/* The library of ready-made stacks, each anchored to a moment the day already has — a
          native modal sheet with a left-aligned Close, like Discover beside it. */}
      <Stack.Screen
        name="stack-library"
        options={{ ...modalHeaderOptions(theme), title: 'Ready-made stacks', headerLeft: headerCloseAction(() => router.back()) }}
      />
      {/* Add an act: search/filter the curated Sunnah library or create your own — a native
          modal sheet (from the bottom, the same idiom as the editor it sits beside in the empty
          state), with a centered "Add acts" title, a native search bar, and a left-aligned
          Close; the pinned chips sit below it. With a `stackId` param it adds into that stack. */}
      <Stack.Screen
        name="discover"
        options={{ ...modalHeaderOptions(theme), title: 'Add acts', headerLeft: headerCloseAction(() => router.back()) }}
      />
      {/* New / edit habit — a native modal sheet; Cancel/Save live in its nav bar. */}
      <Stack.Screen name="editor" options={modalHeaderOptions(theme)} />
      {/* A single act's or exchange's Insights (stats + graphs) — a pushed transparent screen so
          the fixed sky shows behind its cards, like Progress. Reached from its options sheet. */}
      <Stack.Screen name="stats" options={transparentScreen} />
      {/* A whole stack's Insights — the same four cards over the stack's seal history, reached
          from "Manage stack". Presented exactly like its per-act sibling above. */}
      <Stack.Screen name="stack-stats" options={transparentScreen} />
      {/* Name a new (empty) stack — the one-field modal the add menu's "New stack" opens. */}
      <Stack.Screen name="stack-new" options={modalHeaderOptions(theme)} />
      {/* Rename a stack — the one-field modal the manage menu's Rename action opens. */}
      <Stack.Screen name="stack-rename" options={modalHeaderOptions(theme)} />
      {/* The stack picker — where an act goes. A native form sheet sized to its content (the
          existing stacks, plus starting a new one). */}
      <Stack.Screen name="add-to-stack" options={formSheetOptions(theme)} />
      {/* One act's options (skip today / insights / edit / move) — raised by tapping an act line,
          since acts are read rather than ticked. */}
      <Stack.Screen name="act-actions" options={formSheetOptions(theme)} />
      {/* "Manage stack" (edit / delete / add acts) for a stack card — raised by its ⋯. */}
      <Stack.Screen name="stack-manage" options={formSheetOptions(theme)} />
      {/* The habit-stacking guide. A pushed screen, not a sheet: it carries a photograph and four
          sections, which a `fitToContents` sheet can neither scroll nor grow to hold. It is opened
          from inside the "New stack" modal, so pushing (a back button, a real title) beats
          stacking a second modal on the first. Its title comes from the guide data. */}
      <Stack.Screen name="stacking-info" />
      {/* The library of ready-made exchanges — the other half of the "+" fork, presented like the
          stack library beside it. */}
      <Stack.Screen
        name="exchange-library"
        options={{
          ...modalHeaderOptions(theme),
          title: 'Ready-made exchanges',
          headerLeft: headerCloseAction(() => router.back()),
        }}
      />
      {/* New / edit exchange — a native modal sheet; Cancel/Save live in its nav bar. */}
      <Stack.Screen name="exchange" options={modalHeaderOptions(theme)} />
      {/* The day's note. A full-screen modal, like the editors — it holds a focused text field and
          a keyboard, which a `fitToContents` sheet can carry neither of comfortably. Opened from
          the foot of the day, or from a Journal row with the day it belongs to as a param. */}
      <Stack.Screen name="note" options={modalHeaderOptions(theme)} />
      {/* Every note ever written — a pushed transparent screen so the fixed sky shows behind the
          months, like Insights and Progress. Its search bar is native (see the screen itself). */}
      <Stack.Screen name="journal" options={transparentScreen} />
      {/* The exchange guide — the sibling of `stacking-info`, opened from the "New exchange" form. */}
      <Stack.Screen name="exchange-info" />
    </TabStack>
  );
}
