import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { WeekdayPicker } from '@/components/weekday-picker';
import { useHabits } from '@/hooks/use-habits';
import { DAILY_SCHEDULE } from '@/lib/dates';
import { normalizeName, otherNames } from '@/lib/names';

/**
 * The new/edit-exchange form — one params-driven modal for both, the way `editor.tsx` is for
 * acts. `id="new"` creates; any other id edits that exchange.
 *
 * The three fields are the three parts of a replacement plan, in the order they happen: the
 * moment arrives, the old routine is what you turn from, and the deed is what you do instead.
 * All three are required, and the cue especially — a pairing with no situation attached is not an
 * if-then plan, and an if-then plan is the entire mechanism. The form asks for no goal count and
 * no Hijri recurrence: an exchange is binary ("did it happen instead?"), and an urge keeps a
 * weekly rhythm at most.
 *
 * Nowhere does it ask what you will *stop* doing. The old routine is a label so you recognise the
 * moment; a field phrased as a refusal would be the one thing the evidence says makes a habit
 * stronger.
 */
export default function ExchangeFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { habits, createHabits, updateHabit } = useHabits();

  const isNew = !id || id === 'new';
  const habit = isNew ? null : (habits.find((h) => h.id === id) ?? null);

  const [cue, setCue] = useState(habit?.cue ?? '');
  const [insteadOf, setInsteadOf] = useState(habit?.instead_of ?? '');
  const [name, setName] = useState(habit?.name ?? '');
  const [days, setDays] = useState<Set<number>>(() => new Set(habit?.schedule_days ?? DAILY_SCHEDULE));

  const trimmedName = name.trim();
  // Same duplicate guard the act editor runs, folded through the same normalizer: nothing in the
  // DB enforces name uniqueness, so two identical rows would be indistinguishable in Insights.
  const existingNames = useMemo(() => otherNames(habits, id), [habits, id]);
  const isDuplicate = trimmedName.length > 0 && existingNames.includes(normalizeName(trimmedName));
  const canSave =
    trimmedName.length > 0 && insteadOf.trim().length > 0 && cue.trim().length > 0 && !isDuplicate && days.size > 0;

  const save = () => {
    if (!canSave) return;
    const fields = {
      name: trimmedName,
      instead_of: insteadOf.trim(),
      cue: cue.trim(),
      schedule_days: [...days].sort((a, b) => a - b),
    };
    // `createHabits` lands rows with no `stack_id`, which is exactly right here — an exchange is
    // anchored to an urge, not to a moment, so it belongs to no stack.
    if (isNew) void createHabits([fields]);
    else if (habit) void updateHabit(habit.id, fields);
    router.back();
  };

  // Editing one that no longer exists (stale deep link, or deleted from another screen): back out
  // rather than render a form with nothing behind it.
  const stale = !isNew && !habit;
  useEffect(() => {
    if (stale) router.back();
  }, [stale, router]);
  if (stale) return null;

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          // Sentence case, like every other title in this stack ("New act", "New stack").
          title: isNew ? 'New exchange' : 'Edit exchange',
          // Centered so it doesn't crowd "Cancel" on Android's left-aligned header.
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: save, canSave }),
        }}
      />

      {/* Lowercase placeholders throughout: the row renders these mid-sentence, inside
          "Instead of soft drinks · when I sit down to eat". */}
      <FormField
        label="WHEN"
        value={cue}
        onChangeText={setCue}
        placeholder="when I sit down to eat"
        autoCapitalize="none"
        autoFocus={isNew}
        accessibilityLabel="When this happens"
        hint="A moment you would notice arriving."
      />

      <FormField
        label="INSTEAD OF"
        value={insteadOf}
        onChangeText={setInsteadOf}
        placeholder="soft drinks"
        autoCapitalize="none"
        accessibilityLabel="Instead of"
        hint="Named so you recognise the moment — this is not what gets tracked."
      />

      {/* Past tense, like every habit name in the app: it is read at the moment of ticking, and
          what the tick asserts is that the deed is done. */}
      <FormField
        label="I DID"
        value={name}
        onChangeText={setName}
        placeholder="Drank a glass of water"
        autoCapitalize="sentences"
        accessibilityLabel="What you did instead"
        error={isDuplicate ? 'You already use that name.' : undefined}
        hint={isDuplicate ? undefined : 'Something actually to hand in that moment.'}
      />

      <FieldLabel>REPEAT</FieldLabel>
      <WeekdayPicker days={days} onChange={setDays} />
    </FormScreen>
  );
}
