import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { MomentPicker } from '@/components/moment-picker';
import { useToast } from '@/components/toast';
import { useHabits } from '@/hooks/use-habits';
import { haptics } from '@/lib/haptics';
import { MOMENTS, type MomentKey } from '@/lib/moments';
import { normalizeName, otherNames } from '@/lib/names';

/**
 * Name a new stack — the modal behind the add menu's "New stack" (a name, plus an optional
 * moment anchor). Deliberately NO autofocus: the sheet opens with the whole moment grid in
 * view (a raised keyboard buried it), and picking a moment prefills the name — the common
 * case is one tap and Create. Creates an intentionally empty stack: it lands on Today at its
 * moment's day-order slot (or the end, unanchored) as a card holding an "Add your first
 * habit" row, so the next step is visible in the world rather than remembered.
 */
export default function StackNewScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { stacks, createStack, deleteStack } = useHabits();

  const [name, setName] = useState('');
  const [moment, setMoment] = useState<MomentKey | null>(null);
  // Most stacks are named after their moment ("Fajr", "Night", "Waking up"), so picking one
  // prefills the name — the common case is open → tap a moment → Create, zero typing. The
  // prefill follows the picked moment only until the user types a name of their own; clearing
  // the field entirely hands naming back to the picker.
  const [nameTyped, setNameTyped] = useState(false);
  const pickMoment = (next: MomentKey | null) => {
    setMoment(next);
    if (!nameTyped) setName(next ? MOMENTS[next].label : '');
  };
  const typeName = (text: string) => {
    setName(text);
    setNameTyped(text.trim().length > 0);
  };

  // Existing stacks' folded names — a new stack can't collide with one (same fold as rename).
  const existingNames = useMemo(() => otherNames(stacks), [stacks]);
  const trimmed = name.trim();
  const isDuplicate = trimmed.length > 0 && existingNames.includes(normalizeName(trimmed));
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
      show('Stack created — add your first habit', 'success', {
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
        placeholder="e.g. After Fajr"
        autoCapitalize="sentences"
        accessibilityLabel="Stack name"
        error={isDuplicate ? 'You already have a stack with this name.' : undefined}
      />

      <MomentPicker value={moment} onChange={pickMoment} />
    </FormScreen>
  );
}
