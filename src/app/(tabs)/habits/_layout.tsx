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
      {/* Today's private journal entry and its explicit AI-processing consent. */}
      <Stack.Screen name="note" options={modalHeaderOptions(theme)} />
      {/* Which day the list shows — a month grid in a compact sheet, opened from the calendar
          glyph in the header. A sheet rather than a strip above the list: backfilling is
          occasional, and the strip charged every day for it. */}
      <Stack.Screen name="day-picker" options={formSheetOptions(theme)} />
      {/* What you mean to do, before any of it has a day — a native modal sheet with a
          left-aligned Close, like the two libraries above it. */}
      <Stack.Screen
        name="plans"
        options={{ ...modalHeaderOptions(theme), title: 'Plans', headerLeft: headerCloseAction(() => router.back()) }}
      />
      {/* One plan and its notes. PUSHED inside that modal, not presented over it: it wants a back
          button and a title of its own, the same call `stacking-info` makes from inside the
          New-stack form. Its Cancel/Save live in the nav bar. */}
      <Stack.Screen name="plan" />
      {/* A single act's or exchange's Stats (figures + graphs) — a pushed transparent screen so
          the fixed sky shows behind its cards, like Progress. Reached from its options sheet. */}
      <Stack.Screen name="stats" options={transparentScreen} />
      {/* A whole stack's Stats — the same four cards over the stack's seal history, reached
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
      {/* The exchange guide — the sibling of `stacking-info`, opened from the "New exchange" form. */}
      <Stack.Screen name="exchange-info" />
      {/* Answering a check-in: one number, an optional note. A `fitToContents` sheet rather than a
          modal — it is one field, and a whole screen for one number reads as a form to be filled
          in rather than as a question to be answered in passing. */}
      <Stack.Screen name="check-in" options={formSheetOptions(theme)} />
      {/* Setting a goal. It lives in this stack because the "+" sheet is its one door: a goal is
          made where the day is, and it arrives on the day asking. Editing one is the same
          component, mounted in the Progress stack where the goal is read. */}
      <Stack.Screen name="goal-new" options={modalHeaderOptions(theme)} />
    </TabStack>
  );
}
