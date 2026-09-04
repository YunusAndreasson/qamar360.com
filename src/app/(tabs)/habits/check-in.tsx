import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { useHabitsNavigation } from '@/hooks/use-habits';
import { answeredOn, describeCadence, formatReading, latestBefore } from '@/lib/check-ins';
import { dayTitle } from '@/lib/dates';

/**
 * Answering a check-in: where the goal stands today.
 *
 * The field opens on the **last reading**, not on a blank. A weigh-in is 82.4 after 83.1 and a
 * ḥifẓ report is page 344 after 340 — both are small edits to a number you already have, and
 * making you retype it from nothing is the difference between a gesture you keep up and one you
 * stop making. The note is optional and short: what the figure does not say.
 *
 * It writes to the **viewed day**, carried in on the route. Stepping back to a day and correcting
 * what was recorded then has to land on that day; the unique index on `(goal_id, taken_on)` means
 * a second answer replaces the first rather than laying a second point beside it.
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
      <FormScreen>
        <Stack.Screen options={{ title: 'Check in', headerTitleAlign: 'center' }} />
        <ThemedText themeColor="textSecondary">That goal is no longer here.</ThemedText>
      </FormScreen>
    );
  }

  const save = () => {
    if (!canSave) return;
    // Awaited BEFORE leaving, unlike the forms that create a stack or a to-do.
    //
    // Today refetches its goals on focus, and that SELECT is issued the instant this screen pops.
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
    <FormScreen>
      <Stack.Screen
        options={{
          title: existing ? 'Correct the reading' : 'Check in',
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: save, canSave, saveLabel: 'Save' }),
        }}
      />

      <ThemedText type="rowTitle">{goal.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {takenOn === today ? describeCadence(goal) : `For ${dayTitle(takenOn, today)}`}
      </ThemedText>

      {/* The unit sits beside the field rather than inside it: a suffix inside a numeric input
          moves as the number grows, and this one is read while typing. */}
      <View style={styles.measure}>
        <View style={styles.field}>
          <FormField
            label="WHERE YOU ARE"
            value={value}
            onChangeText={setTyped}
            keyboardType="decimal-pad"
            selectTextOnFocus
            autoFocus
            accessibilityLabel={`Reading in ${goal.unit}`}
          />
        </View>
        <View style={styles.unit}>
          <FieldLabel> </FieldLabel>
          <ThemedText type="rowTitle" themeColor="textSecondary">
            {goal.unit}
          </ThemedText>
        </View>
      </View>

      {previous ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`Last reading ${formatReading(previous.value)} ${goal.unit}, ${dayTitle(previous.taken_on, today).toLowerCase()}`}
        </ThemedText>
      ) : null}

      <FormField
        label="NOTE"
        value={noteValue}
        onChangeText={setNote}
        placeholder="What the number doesn’t say"
        autoCapitalize="sentences"
        multiline
        accessibilityLabel="Note"
        style={styles.note}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  // `FormField` spreads `style` onto its own `TextInput`, so a `flex: 1` passed straight in would
  // stretch the input inside a wrapper that never grew — and put both labels beside their boxes.
  // The flex belongs on a `View` around it.
  measure: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  field: { flex: 1 },
  unit: { paddingTop: Spacing.four },
  note: { minHeight: 88, textAlignVertical: 'top' },
});
