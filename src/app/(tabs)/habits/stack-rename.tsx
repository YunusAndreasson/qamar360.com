import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { MomentPicker } from '@/components/moment-picker';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabits } from '@/hooks/use-habits';
import { momentOf, type MomentKey } from '@/lib/moments';
import { isDuplicateName, otherNames } from '@/lib/names';

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
  const [moment, setMoment] = useState<MomentKey | null>(() => (stack ? momentOf(stack) : null));

  // Other stacks' folded names — a rename can't collide with one (same fold the habits use).
  const existingNames = useMemo(() => otherNames(stacks, id), [stacks, id]);
  const trimmed = name.trim();
  const isDuplicate = isDuplicateName(trimmed, existingNames);
  const nameChanged = trimmed !== stack?.name;
  const momentChanged = moment !== (stack ? momentOf(stack) : null);
  // Save only a real, non-colliding change — keeping the current name and anchor is a no-op.
  const canSave = trimmed.length > 0 && !isDuplicate && (nameChanged || momentChanged);

  // Editing a stack that no longer exists (deleted elsewhere): back out. `stack` is narrowed
  // non-null for the rest of the component from here on.
  useBackIfStale(!!id && !stack);
  if (!stack) return null;

  const save = () => {
    if (!canSave) return;
    const patch: { name?: string; moment?: MomentKey | null } = {};
    if (nameChanged) patch.name = trimmed;
    if (momentChanged) patch.moment = moment;
    void updateStack(stack.id, patch);
    router.back();
  };

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
        placeholder="e.g. Fajr"
        autoCapitalize="sentences"
        accessibilityLabel="Stack name"
        error={isDuplicate ? 'You already have a stack with this name.' : undefined}
      />

      <MomentPicker value={moment} onChange={setMoment} />
    </FormScreen>
  );
}
