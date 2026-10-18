import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, type TextInputInstance } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { GuideLink } from '@/components/guide-link';
import { WeekdayPicker } from '@/components/weekday-picker';
import { Spacing } from '@/constants/theme';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive } from '@/lib/alerts';
import { DAILY_SCHEDULE } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { isDuplicateName, siblingNames } from '@/lib/names';

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
  const { habits, createHabits, updateHabit, deleteHabit } = useHabits();

  const isNew = !id || id === 'new';
  const habit = isNew ? null : (habits.find((h) => h.id === id) ?? null);

  const [cue, setCue] = useState(habit?.cue ?? '');
  const [insteadOf, setInsteadOf] = useState(habit?.instead_of ?? '');
  const [name, setName] = useState(habit?.name ?? '');
  const [days, setDays] = useState<Set<number>>(() => new Set(habit?.schedule_days ?? DAILY_SCHEDULE));
  // The return key walks the plan in the order it happens — When → Instead of → I did — and the
  // last one's Done saves, so the form can be filled without reaching for the nav bar.
  const insteadOfRef = useRef<TextInputInstance>(null);
  const nameRef = useRef<TextInputInstance>(null);

  const trimmedName = name.trim();
  // Same duplicate guard the act editor runs, folded through the same normalizer: nothing in the
  // DB enforces name uniqueness, so two identical rows would be indistinguishable in Stats.
  // An exchange stands loose, so it only has to differ from the other loose habits.
  const existingNames = useMemo(() => siblingNames(habits, null, id), [habits, id]);
  const isDuplicate = isDuplicateName(trimmedName, existingNames);
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
    if (isNew) {
      void createHabits([fields]);
      // The same crisp "commit" as creating an act or a stack — every way something enters the
      // day confirms with one texture. Editing in place stays silent, as it does for an act.
      haptics.added();
    } else if (habit) void updateHabit(habit.id, fields);
    // Back to the day, where the new row now is — not to the library this form may have been
    // opened from. Cancel is the one that steps back a screen.
    router.dismissTo('/habits');
  };

  const confirmDelete = () => {
    if (!habit) return;
    // Deleting drops it from state and the stale guard below backs the form out — don't also
    // navigate here, or it pops twice. Same words as the exchange's own `⋯` sheet.
    confirmDestructive({
      title: 'Delete exchange',
      message: `Delete “${habit.name}”? Its history goes with it.`,
      onConfirm: () => {
        haptics.removed();
        void deleteHabit(habit.id);
      },
    });
  };

  // Editing one that no longer exists (stale deep link, or deleted from another screen): back out
  // rather than render a form with nothing behind it.
  const stale = !isNew && !habit;
  useBackIfStale(stale);
  if (stale) return null;

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          // Sentence case, like every other title in this stack ("New act", "New stack").
          title: isNew ? 'New exchange' : 'Edit exchange',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: save, canSave, saveLabel: isNew ? 'Create' : 'Save' }),
        }}
      />

      {/* Lowercase placeholders throughout: the row renders these mid-sentence, inside
          "instead of soft drinks · sitting down to eat". The WHEN placeholder is the bare moment,
          not "when I sit down to eat" — the label already says when, and the day's row is read
          tired, where a leading "when I" on every exchange is a third of the line spent on
          grammar. The hint asks for the same brevity in words. */}
      <FormField
        label="When"
        value={cue}
        onChangeText={setCue}
        placeholder="sitting down to eat"
        autoCapitalize="none"
        autoFocus={isNew}
        accessibilityLabel="When this happens"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => insteadOfRef.current?.focus()}
        hint="A moment you would notice arriving, in a few words."
      />

      <FormField
        label="Instead of"
        value={insteadOf}
        onChangeText={setInsteadOf}
        ref={insteadOfRef}
        placeholder="soft drinks"
        autoCapitalize="none"
        accessibilityLabel="Instead of"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => nameRef.current?.focus()}
        hint="Named so you recognise the moment. This is not what gets tracked."
      />

      {/* Past tense, like every habit name in the app: it is read at the moment of ticking, and
          what the tick asserts is that the deed is done. */}
      <FormField
        label="I did"
        value={name}
        onChangeText={setName}
        ref={nameRef}
        placeholder="e.g. Drank a glass of water"
        autoCapitalize="sentences"
        accessibilityLabel="What you did instead"
        returnKeyType="done"
        onSubmitEditing={save}
        // Exchanges and loose habits sit side by side on Today, so "habit" is the word that covers
        // whichever one already holds this name.
        error={isDuplicate ? 'You already have a habit by that name.' : undefined}
        hint={isDuplicate ? undefined : 'Something actually to hand in that moment.'}
      />

      <FieldLabel>Repeat</FieldLabel>
      <WeekdayPicker days={days} onChange={setDays} />

      {/* Three fields is a lot to ask of someone who hasn't been told why each one matters, and
          this form can be opened without passing the library that explains it. */}
      <GuideLink label="Why replacing works" href="/habits/exchange-info" />

      {/* Delete (editing only) — where the act editor keeps its own, so both forms end the same. */}
      {habit ? (
        <AppButton variant="destructive" onPress={confirmDelete} style={styles.delete}>
          Delete exchange
        </AppButton>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  delete: { marginTop: Spacing.four },
});
