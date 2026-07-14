import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { useToast } from '@/components/toast';
import { useHabits } from '@/hooks/use-habits';
import { haptics } from '@/lib/haptics';
import { normalizeName, otherNames } from '@/lib/names';

/**
 * Name a new stack — the one-field modal behind the add menu's "New stack". Creates an
 * intentionally empty stack: it lands at the end of Today as a card holding an "Add your
 * first habit" row, so the next step is visible in the world rather than remembered. The
 * full-screen modal is the right home for a focused text field (same reasoning as rename).
 */
export default function StackNewScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { stacks, createStack, deleteStack } = useHabits();

  const [name, setName] = useState('');

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
      const id = await createStack(trimmed, []);
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
        onChangeText={setName}
        placeholder="e.g. After Fajr"
        autoCapitalize="sentences"
        autoFocus
        accessibilityLabel="Stack name"
        error={isDuplicate ? 'You already have a stack with this name.' : undefined}
      />
    </FormScreen>
  );
}
