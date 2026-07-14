import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { useHabits } from '@/hooks/use-habits';
import { normalizeName, otherNames } from '@/lib/names';

/**
 * Rename a stack — a one-field modal reached from the manage menu's Rename action. A name-only
 * `updateStack` patch (never an empty member list, which would delete the stack). The full-screen
 * modal is the right home for a focused text field, so the keyboard never has to live in the sheet.
 */
export default function StackRenameScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { stacks, updateStack } = useHabits();

  const stack = stacks.find((s) => s.id === id) ?? null;
  const [name, setName] = useState(stack?.name ?? '');

  // Other stacks' folded names — a rename can't collide with one (same fold the habits use).
  const existingNames = useMemo(() => otherNames(stacks, id), [stacks, id]);
  const trimmed = name.trim();
  const isDuplicate = trimmed.length > 0 && existingNames.includes(normalizeName(trimmed));
  // Save only a real, non-colliding change — keeping the current name is a no-op.
  const canSave = trimmed.length > 0 && !isDuplicate && trimmed !== stack?.name;

  const save = () => {
    if (!canSave || !stack) return;
    void updateStack(stack.id, { name: trimmed });
    router.back();
  };

  // Renaming a stack that no longer exists (deleted elsewhere): back out.
  useEffect(() => {
    if (id && !stack) router.back();
  }, [id, stack, router]);
  if (!stack) return null;

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: 'Rename stack',
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: save, canSave }),
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
