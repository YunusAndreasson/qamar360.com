import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { SectionLabel } from '@/components/section-label';
import { SelectablePill } from '@/components/selectable-pill';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { WeekdayPicker } from '@/components/weekday-picker';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { useHabitsNavigation } from '@/hooks/use-habits';
import { CADENCES, cadenceFields, cadenceOf, describeCadence, type CadenceKey } from '@/lib/check-ins';
import { haptics } from '@/lib/haptics';
import { usePreference } from '@/lib/preferences';

/**
 * Setting up a check-in — the "+" sheet's fourth noun, and the one that is not a noun of its own.
 *
 * A check-in belongs to a goal. It has to: the number you report is the goal's measure, and a
 * recurring question with nothing behind it would be a fifth thing to answer and no thing to move.
 * So the screen begins by naming which goal is going to ask, and with no goals at all it is one
 * row pointing at where goals are made — an honest dead end rather than a form you cannot fill in.
 *
 * A goal that has never been measured is also asked **where it is now**. That reading is its
 * baseline, and it is what settles which way the measure travels — a starting value above the
 * target means the number has to come down, which is the one thing no act can do and the reason
 * this feature exists.
 */
export default function CheckInNewScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { goalId: preselected } = useLocalSearchParams<{ goalId?: string }>();
  const { today } = useHabitsNavigation();
  const weekStart = usePreference('weekStart');
  const { goals, checkIns, updateGoal, saveCheckIn } = useGoals();

  const live = goals.filter((goal) => goal.status === 'open');
  const [pickedId, setPickedId] = useState<string | null>(preselected ?? null);
  const goal = live.find((g) => g.id === pickedId) ?? null;

  // Derived from the goal, not seeded into state: the picked goal's own cadence is the answer
  // until something is chosen, so opening a goal that already asks weekly shows "Once a week".
  const [chosen, setChosen] = useState<CadenceKey | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [startText, setStartText] = useState('');
  const cadence = chosen ?? (goal ? cadenceOf(goal) : null) ?? 'weekly';
  const pickedWeekday = weekday ?? goal?.check_in_days[0] ?? 1;

  const measured = goal ? checkIns.some((c) => c.goal_id === goal.id) : false;
  const needsStart = goal !== null && !measured;
  const start = Number(startText.trim().replace(',', '.'));
  const canSave = goal !== null && (!needsStart || (startText.trim().length > 0 && Number.isFinite(start)));

  const save = () => {
    if (!goal || !canSave) return;
    haptics.added();
    // Both writes are awaited before this screen pops, for the reason `check-in.tsx` spells out:
    // Today's focus refetch can otherwise beat them and drop what was just written.
    void (async () => {
      const fields = cadenceFields(cadence, pickedWeekday, today);
      // A starting value above the target means the measure has to fall. Settled once, stored, and
      // never asked again: inferred live, a weight goal would read as reached the first time it
      // dipped under target and stay wrong when it rose back.
      const direction = needsStart && start > goal.target_value ? 'down' : goal.direction;
      const saved = await updateGoal(goal.id, { ...fields, direction });
      if (!saved) {
        router.back();
        return;
      }
      // The baseline second, and after the cadence — a goal that asks but has no baseline yet is a
      // state its screen already knows how to say, where a baseline on a goal that asks nothing
      // would be a reading nobody will ever be prompted to follow.
      if (needsStart) await saveCheckIn(goal.id, { takenOn: today, value: start, note: '' });
      router.back();
      show(`${goal.title} · ${describeCadence({ ...goal, ...fields }, weekStart).toLowerCase()}`, 'success');
    })();
  };

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: 'Check-in',
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: save, canSave, saveLabel: 'Set' }),
        }}
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        A check-in asks where a goal stands, on the days you choose. It sits on your day until you
        answer it.
      </ThemedText>

      {live.length === 0 ? (
        <SettingsSection title="GOALS">
          <SettingsRow
            icon="add"
            label="Set a goal"
            sublabel="A check-in reports on a goal, so there has to be one first"
            showChevron
            onPress={() => router.replace('/(tabs)/insights/goal/new')}
          />
        </SettingsSection>
      ) : (
        <SettingsSection title="WHICH GOAL">
          {live.map((option) => (
            <SettingsRow
              key={option.id}
              label={option.title}
              sublabel={option.id === pickedId ? 'Asking about this one' : describeCadence(option, weekStart)}
              onPress={() => {
                haptics.selection();
                setPickedId(option.id);
                setChosen(null);
                setWeekday(null);
              }}
            />
          ))}
        </SettingsSection>
      )}

      {goal ? (
        <>
          <FieldLabel style={styles.label}>HOW OFTEN</FieldLabel>
          <View style={styles.cadences}>
            {CADENCES.map((option) => (
              <SelectablePill
                key={option.key}
                label={option.label}
                selected={cadence === option.key}
                onPress={() => {
                  haptics.selection();
                  setChosen(option.key);
                }}
              />
            ))}
          </View>

          {cadence === 'weekly' ? (
            <WeekdayPicker
              days={new Set([pickedWeekday])}
              // One day, not a set: a weekly check-in asks once. Tapping another day moves it
              // rather than adding a second, which is what the shared picker would otherwise do.
              onChange={(days) => {
                const next = [...days].find((d) => d !== pickedWeekday);
                if (next !== undefined) setWeekday(next);
              }}
            />
          ) : null}

          {needsStart ? (
            <>
              <SectionLabel style={styles.label}>WHERE IT STANDS NOW</SectionLabel>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                {`This is the goal's first reading, and it is what tells the app which way ${goal.title} has to travel to reach ${goal.target_value} ${goal.unit}.`}
              </ThemedText>
              <View style={styles.measure}>
                <View style={styles.field}>
                  <FormField
                    value={startText}
                    onChangeText={setStartText}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    accessibilityLabel={`Starting reading in ${goal.unit}`}
                  />
                </View>
                <View style={styles.unit}>
                  <ThemedText type="rowTitle" themeColor="textSecondary">
                    {goal.unit}
                  </ThemedText>
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  lede: { marginBottom: Spacing.two },
  label: { marginTop: Spacing.three },
  hint: { marginTop: Spacing.one },
  cadences: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  // `FormField` spreads `style` onto its `TextInput`, so the flex belongs on a `View` around it.
  measure: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  field: { flex: 1 },
  unit: { paddingTop: Spacing.one },
});
