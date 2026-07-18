import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { DayPartPicker } from '@/components/day-part-picker';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { useHabits } from '@/hooks/use-habits';
import { normalizeName, otherNames } from '@/lib/names';
import { asDayPart, type DayPart } from '@/lib/sun';

/**
 * Edit a stack — its name and its time-of-day anchor — a small modal reached from the manage
 * menu's "Edit stack" action. Patches only what changed (never an empty member list, which
 * would delete the stack). The full-screen modal is the right home for a focused text field,
 * so the keyboard never has to live in the sheet. (Route keeps its historical `stack-rename`
 * filename — renaming a route is pure navigation churn.)
 */
export default function StackRenameScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { stacks, updateStack } = useHabits();

  const stack = stacks.find((s) => s.id === id) ?? null;
  const [name, setName] = useState(stack?.name ?? '');
  const [dayPart, setDayPart] = useState<DayPart | null>(() => asDayPart(stack?.day_part));

  // Other stacks' folded names — a rename can't collide with one (same fold the habits use).
  const existingNames = useMemo(() => otherNames(stacks, id), [stacks, id]);
  const trimmed = name.trim();
  const isDuplicate = trimmed.length > 0 && existingNames.includes(normalizeName(trimmed));
  const nameChanged = trimmed !== stack?.name;
  const dayPartChanged = dayPart !== asDayPart(stack?.day_part);
  // Save only a real, non-colliding change — keeping the current name and anchor is a no-op.
  const canSave = trimmed.length > 0 && !isDuplicate && (nameChanged || dayPartChanged);

  const save = () => {
    if (!canSave || !stack) return;
    const patch: { name?: string; dayPart?: DayPart | null } = {};
    if (nameChanged) patch.name = trimmed;
    if (dayPartChanged) patch.dayPart = dayPart;
    void updateStack(stack.id, patch);
    router.back();
  };

  // Editing a stack that no longer exists (deleted elsewhere): back out.
  useEffect(() => {
    if (id && !stack) router.back();
  }, [id, stack, router]);
  if (!stack) return null;

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: 'Edit stack',
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

      <DayPartPicker value={dayPart} onChange={setDayPart} />
    </FormScreen>
  );
}
