import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { FormSheet } from '@/components/form-sheet';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { useHabitsNavigation } from '@/hooks/use-habits';
import { answeredOn, describeCadence, formatReading, latestBefore } from '@/lib/check-ins';
import { dayInSentence, dayTitle } from '@/lib/dates';

/**
 * Answering a check-in: where the goal stands today.
 *
 * A sheet, not a screen. It is one number and an optional line, raised from a row on the day, and
 * a full modal for that read as a form to be filled in rather than as a question to be answered in
 * passing. The goal's name is the sheet's heading, so what is being asked is stated by the thing
 * asking it, and the cadence sits under it as the reason it appeared today.
 *
 * The field opens on the **last reading**, not on a blank. A weigh-in is 82.4 after 83.1 and a
 * ḥifẓ report is page 344 after 340 — both are small edits to a number you already have, and
 * making you retype it from nothing is the difference between a gesture you keep up and one you
 * stop making. The note is optional and short: what the figure does not say.
 *
 * It writes to the **viewed day**, carried in on the route. Stepping back to a day and correcting
 * what was recorded then has to land on that day; the unique index on `(goal_id, taken_on)` means
 * a second answer replaces the first rather than laying a second point beside it.
 *
 * Nothing here grades the number. The row that raised this sheet fills its ring the moment a
 * reading exists, whichever way the reading went — a heavier week is a week you reported, and an
 * instrument that scored it would teach you to stop reporting the weeks that went badly.
 */
export default function CheckInScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { goalId, day } = useLocalSearchParams<{ goalId: string; day?: string }>();
  const { today } = useHabitsNavigation();
  const { goals, checkIns, saveCheckIn } = useGoals();

  const goal = goals.find((g) => g.id === goalId) ?? null;
  const takenOn = day ?? today;
  const existing = goal ? answeredOn(checkIns, goal.id, takenOn) : null;
  const previous = goal ? latestBefore(checkIns, goal.id, takenOn) : null;

  // Derived, never seeded from an effect: `null` means untouched, so the field follows the reading
  // it opens on until the moment something is typed. (`react-hooks/set-state-in-effect` rejects
  // the copy-into-state shape the seed-once version would need.)
  const [typed, setTyped] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const opening = existing?.value ?? previous?.value ?? null;
  const value = typed ?? (opening === null ? '' : String(opening));
  const noteValue = note ?? existing?.note ?? '';

  // Accepts a comma as well as a point: half this app's users type a decimal one way and half the
  // other, and a rejected weight is a rejected habit.
  const parsed = Number(value.trim().replace(',', '.'));
  const canSave = goal !== null && value.trim().length > 0 && Number.isFinite(parsed);

  if (!goal) {
    return (
      <FormSheet title="Check in">
        <ThemedText themeColor="textSecondary">That goal is no longer here.</ThemedText>
      </FormSheet>
    );
  }

  const save = () => {
    if (!canSave) return;
    // Awaited BEFORE leaving, unlike the forms that create a stack or a to-do.
    //
    // Today refetches its goals on focus, and that SELECT is issued the instant this sheet pops.
    // It can beat this write to the server, and `fetchGoals` sets the readings wholesale — so the
    // reading lands, is dropped by a refetch that never saw it, and the row comes back asking the
    // question you just answered. Seen on device, not reasoned about: exactly the race
    // `createTask` documents in `use-tasks`, and the same fix.
    void (async () => {
      const saved = await saveCheckIn(goal.id, { takenOn, value: parsed, note: noteValue });
      router.back();
      if (saved) show(`${goal.title} · ${formatReading(parsed)} ${goal.unit}`, 'success');
    })();
  };

  return (
    <FormSheet
      title={goal.title}
      subtitle={takenOn === today ? describeCadence(goal) : `For ${dayTitle(takenOn, today)}`}>
      {/* The unit sits beside the field rather than inside it: a suffix inside a numeric input
          moves as the number grows, and this one is read while typing. */}
      <View>
        <FieldLabel>{existing ? 'CORRECT THE READING' : 'WHERE YOU ARE'}</FieldLabel>
        <View style={styles.measure}>
          <View style={styles.field}>
            <FormField
              value={value}
              onChangeText={setTyped}
              keyboardType="decimal-pad"
              selectTextOnFocus
              autoFocus
              accessibilityLabel={`Reading in ${goal.unit}`}
            />
          </View>
          <View style={styles.unit}>
            <ThemedText type="rowTitle" themeColor="textSecondary">
              {goal.unit}
            </ThemedText>
          </View>
        </View>
      </View>

      {previous ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`Last reading ${formatReading(previous.value)} ${goal.unit}, ${dayInSentence(previous.taken_on, today)}`}
        </ThemedText>
      ) : null}

      <FormField
        label="NOTE"
        value={noteValue}
        onChangeText={setNote}
        placeholder="What the number doesn’t say"
        autoCapitalize="sentences"
        multiline
        // The column the database enforces (`char_length(note) <= 500`). Without it a longer note
        // was rejected by Postgres and the sheet closed looking exactly like a save.
        maxLength={500}
        accessibilityLabel="Note"
        style={styles.note}
      />

      {/* The sheet carries no nav bar, so Save is a button of its own. Cancel is the sheet's own
          Close, in the corner every other form sheet closes from. */}
      <AppButton onPress={save} disabled={!canSave} accessibilityLabel="Save this reading">
        Save
      </AppButton>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  // `FormField` spreads `style` onto its own `TextInput`, so a `flex: 1` passed straight in would
  // stretch the input inside a wrapper that never grew. The flex belongs on a `View` around it.
  measure: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  field: { flex: 1 },
  unit: { paddingTop: Spacing.one },
  note: { minHeight: 72, textAlignVertical: 'top' },
});
