import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { GuideLink } from '@/components/guide-link';
import { MomentPicker } from '@/components/moment-picker';
import { useToast } from '@/components/toast';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits } from '@/hooks/use-habits';
import { habitInputFor } from '@/lib/curated';
import { haptics } from '@/lib/haptics';
import { MOMENTS, type MomentKey } from '@/lib/moments';
import { isDuplicateName, otherNames } from '@/lib/names';

/**
 * Name a new stack — the modal behind the add menu's "Build your own" (a name, plus an optional
 * moment anchor). Deliberately NO autofocus: the sheet opens with the whole moment grid in
 * view (a raised keyboard buried it), and picking a moment prefills the name — the common
 * case is one tap and Create. Creates an intentionally empty stack: it lands on Today at its
 * moment's day-order slot (or the end, unanchored) as a card holding an "Add your first
 * act" row, so the next step is visible in the world rather than remembered.
 *
 * Reached from the stack picker's "New stack…", it also carries a pending act (`pendingHabitId`
 * for one that exists, `pendingPresetId` for one from the library) and lands it the moment the
 * stack is created — so "none of these" is never a dead end that loses what you were adding.
 */
export default function StackNewScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { pendingHabitId, pendingPresetId } = useLocalSearchParams<{
    pendingHabitId?: string;
    pendingPresetId?: string;
  }>();
  const { stacks, createStack, deleteStack, moveHabit, createHabitInStack } = useHabits();
  const { presets } = useCatalog();
  const pendingPreset = pendingPresetId ? (presets.find((p) => p.id === pendingPresetId) ?? null) : null;

  const [name, setName] = useState('');
  const [moment, setMoment] = useState<MomentKey | null>(null);
  // Most stacks are named for their moment ("Fajr", "Waking up"), so picking one
  // prefills the name — the common case is open → tap a moment → Create, zero typing. It takes
  // `stackName`, not the picker's `label`: the cell names the deed you anchored to ("Prayed
  // Fajr"), the card header names the occasion that follows it. The prefill follows the picked
  // moment only until the user types a name of their own; clearing the field entirely hands
  // naming back to the picker.
  const [nameTyped, setNameTyped] = useState(false);
  const pickMoment = (next: MomentKey | null) => {
    setMoment(next);
    if (!nameTyped) setName(next ? MOMENTS[next].stackName : '');
  };
  const typeName = (text: string) => {
    setName(text);
    setNameTyped(text.trim().length > 0);
  };

  // Existing stacks' folded names — a new stack can't collide with one (same fold as rename).
  const existingNames = useMemo(() => otherNames(stacks), [stacks]);
  const trimmed = name.trim();
  const isDuplicate = isDuplicateName(trimmed, existingNames);
  const canSave = trimmed.length > 0 && !isDuplicate;

  const save = () => {
    if (!canSave) return;
    haptics.added();
    router.back();
    // Create after closing so the card's arrival on Today is what the eye lands on. The toast
    // waits for the insert to settle so its Undo always has a real id to delete.
    void (async () => {
      const id = await createStack(trimmed, [], { moment });
      if (!id) return;
      // An act was waiting on this stack (the picker's "New stack…") — land it now, and let the
      // toast say where it went instead of asking for a first act the stack already has.
      if (pendingHabitId) {
        await moveHabit(pendingHabitId, { toStackId: id, placement: { type: 'member-append' } });
      } else if (pendingPreset) {
        await createHabitInStack(habitInputFor(pendingPreset), id);
      }
      const landed = pendingHabitId || pendingPreset;
      show(landed ? `Created ${trimmed} — the act is in it` : 'Stack created — add your first act', 'success', {
        label: 'Undo',
        onPress: () => void deleteStack(id),
      });
    })();
  };

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: 'New stack',
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: save, canSave, saveLabel: 'Create' }),
        }}
      />

      <FormField
        label="NAME"
        value={name}
        onChangeText={typeName}
        placeholder="e.g. Fajr"
        autoCapitalize="sentences"
        accessibilityLabel="Stack name"
        error={isDuplicate ? 'You already have a stack with this name.' : undefined}
      />

      <MomentPicker value={moment} onChange={pickMoment} />

      {/* Reachable without passing the library (Today's empty state opens this form directly), so
          the case for anchoring stays one tap away from the blank field too. */}
      <GuideLink label="Why anchoring works" href="/habits/stacking-info" />
    </FormScreen>
  );
}
