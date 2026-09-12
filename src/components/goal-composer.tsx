import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { FormScreen } from '@/components/form-screen';
import { SelectablePill } from '@/components/selectable-pill';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { WeekdayPicker } from '@/components/weekday-picker';
import { HORIZON_SPANS } from '@/constants/goal-templates';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { confirmProceed } from '@/lib/alerts';
import { CADENCES, cadenceOf, cadenceFields, hasCadence, type CadenceKey } from '@/lib/check-ins';
import { hijriParts, todayLocalISO } from '@/lib/dates';
import { parseGoalNumber } from '@/lib/goal-form';
import { horizonFromLunarMonths, type Goal } from '@/lib/goals';
import { haptics } from '@/lib/haptics';

type CadenceChoice = CadenceKey | 'none';

/** Wait for an edit's data before mounting the stateful form. */
export default function GoalComposerScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { goals, loading } = useGoals();
  const editing = id ? goals.find((goal) => goal.id === id) : undefined;
  if (id && !editing) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: 'Edit goal', headerTitleAlign: 'center' }} />
        <ThemedText themeColor="textSecondary">
          {loading ? 'Loading…' : 'That goal is no longer here.'}
        </ThemedText>
      </FormScreen>
    );
  }
  return <GoalForm key={id ?? 'new'} editing={editing} />;
}

function GoalForm({ editing }: { editing?: Goal }) {
  const router = useRouter();
  const { show } = useToast();
  const { createGoal, updateGoal, saveCheckIn, checkIns } = useGoals();
  const today = todayLocalISO();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [unit, setUnit] = useState(editing?.unit ?? '');
  const [targetText, setTargetText] = useState(editing ? String(editing.target_value) : '');
  const [startText, setStartText] = useState('');
  const [spanMonths, setSpanMonths] = useState(11);
  // An edit keeps its exact stored deadline until the user deliberately chooses a new one.
  const [spanTouched, setSpanTouched] = useState(false);
  const [cadence, setCadence] = useState<CadenceChoice>(
    editing ? (hasCadence(editing) ? (cadenceOf(editing) ?? 'weekly') : 'none') : 'weekly',
  );
  const [weekday, setWeekday] = useState(editing?.check_in_days[0] ?? new Date().getDay());
  const [obstacle, setObstacle] = useState(editing?.obstacle ?? '');
  const [ifThen, setIfThen] = useState(editing?.if_then ?? '');
  const [planExpanded, setPlanExpanded] = useState(!!(editing?.obstacle || editing?.if_then));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const mustAsk = editing?.direction === 'down';
  const measured = editing ? checkIns.some((checkIn) => checkIn.goal_id === editing.id) : false;
  const needsStart = cadence !== 'none' && !measured;
  const horizon = editing && !spanTouched ? editing.horizon_on : horizonFromLunarMonths(today, spanMonths);
  const target = parseGoalNumber(targetText);
  const start = parseGoalNumber(startText);
  const titleError = title.trim() ? null : 'Give your goal a name.';
  const unitError = unit.trim() ? null : 'Add a unit, such as books, pages or kg.';
  const targetError = target !== null && target > 0 ? null : 'Enter a target greater than 0.';
  const startError = !needsStart || start !== null ? null : 'Enter your current amount. Use 0 if you have not started.';
  const valid = !titleError && !unitError && !targetError && !startError && horizon !== null;

  const commit = async () => {
    if (!valid || !horizon || target === null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const fields = cadence === 'none'
        ? { check_in_days: [], check_in_hijri: null, check_in_from: null }
        : cadenceFields(cadence, weekday, editing?.check_in_from ?? today);
      const values = {
        title: title.trim(), unit: unit.trim(), target_value: target, horizon_on: horizon,
        obstacle: obstacle.trim(), if_then: ifThen.trim(),
      };
      if (editing) {
        const saved = await updateGoal(editing.id, {
          ...values, ...fields,
          direction: needsStart && start !== null && start > target ? 'down' : editing.direction,
        });
        if (!saved) {
          setSaveError('Could not save your goal. Your entries are still here. Try again.');
          return;
        }
        if (needsStart && start !== null && !await saveCheckIn(editing.id, { takenOn: today, value: start, note: '' })) {
          setSaveError('Your goal was saved, but the starting amount was not. Try saving again.');
          return;
        }
      } else {
        const goal = await createGoal({
          ...values, milestone_step: null, acts: [],
          cadence: cadence === 'none' ? undefined : fields,
          startValue: needsStart && start !== null ? start : undefined,
        });
        if (!goal) {
          setSaveError('Could not create your goal. Your entries are still here. Try again.');
          return;
        }
      }
      haptics.added();
      router.back();
      show(editing ? 'Goal saved' : 'Goal created', 'success');
    } catch {
      setSaveError('Could not save your goal. Check your connection and try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const save = () => {
    if (savingRef.current) return;
    setAttempted(true);
    if (!valid) return;
    if (needsStart && start !== null && target !== null && start > target) {
      confirmProceed({
        title: 'Reduce this amount?',
        message: `Your goal is to go from ${start} to ${target} ${unit.trim()}. This sets your goal to track a decrease and cannot be changed later.`,
        confirmLabel: 'Track a decrease',
        onConfirm: () => { void commit(); },
      });
    } else {
      void commit();
    }
  };

  return (
    <FormScreen>
      <Stack.Screen options={{
        title: editing ? 'Edit goal' : 'New goal', headerTitleAlign: 'center',
        headerLeft: () => (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }}
            disabled={saving} onPress={() => router.back()} style={styles.headerAction}>
            <ThemedText type="small" themeColor={saving ? 'textDisabled' : 'textSecondary'}>Cancel</ThemedText>
          </Pressable>
        ),
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving} onPress={save} style={styles.headerAction}>
            <ThemedText type="smallBold" themeColor={saving ? 'textDisabled' : 'accent'}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </ThemedText>
          </Pressable>
        ),
        gestureEnabled: !saving,
      }} />
      <View pointerEvents={saving ? 'none' : 'auto'} style={styles.form}>
        <ThemedText type="small" themeColor="textSecondary">
          Choose something you can measure, then check in to track your progress.
        </ThemedText>
        <FormField
          label="Goal name" value={title} onChangeText={setTitle}
          placeholder="e.g. Read 12 books" error={attempted ? titleError : null}
          maxLength={200} autoCapitalize="sentences"
        />
        <View style={styles.pair}>
          <View style={styles.half}>
            <FormField
              label="Target amount" value={targetText} onChangeText={setTargetText}
              keyboardType="decimal-pad" placeholder="e.g. 12"
              error={attempted || targetText ? targetError : null}
            />
          </View>
          <View style={styles.half}>
            <FormField
              label="Unit" value={unit} onChangeText={setUnit} placeholder="e.g. books"
              error={attempted ? unitError : null} autoCapitalize="none" maxLength={40}
            />
          </View>
        </View>
        {needsStart ? (
          <FormField
            label={unit.trim() ? `Current amount (${unit.trim()})` : 'Current amount'}
            value={startText} onChangeText={setStartText} keyboardType="decimal-pad"
            placeholder="e.g. 0" hint="How much have you reached so far? Enter 0 if you have not started."
            error={attempted || startText ? startError : null}
          />
        ) : null}

        <FieldLabel style={styles.section}>Time to reach your goal</FieldLabel>
        <View style={styles.choices}>
          {HORIZON_SPANS.map((span) => (
            <SelectablePill
              key={span.months} label={span.label}
              selected={(!editing || spanTouched) && spanMonths === span.months}
              onPress={() => { setSpanMonths(span.months); setSpanTouched(true); }}
            />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {horizonLabel(horizon)}{(!editing || spanTouched) && horizon ? ' · Based on the Hijri calendar.' : ''}
        </ThemedText>

        <FieldLabel style={styles.section}>Check-in schedule</FieldLabel>
        <ThemedText type="small" themeColor="textSecondary">
          {cadence === 'none'
            ? 'No scheduled check-ins. You can add a schedule later in Progress.'
            : 'On check-in days, Today will ask for your latest amount.'}
        </ThemedText>
        <View style={styles.choices}>
          {CADENCES.map((option) => (
            <SelectablePill
              key={option.key} label={option.label} selected={cadence === option.key}
              onPress={() => { haptics.selection(); setCadence(option.key); }}
            />
          ))}
          {!mustAsk ? <SelectablePill label="No schedule" selected={cadence === 'none'} onPress={() => setCadence('none')} /> : null}
        </View>
        {mustAsk ? <ThemedText type="small" themeColor="textSecondary">Check-ins are required to track a decreasing amount.</ThemedText> : null}
        {cadence === 'weekly' ? (
          <>
            <FieldLabel>Check-in day</FieldLabel>
            <WeekdayPicker days={new Set([weekday])} onChange={(days) => {
              const next = [...days].find((day) => day !== weekday);
              if (next !== undefined) setWeekday(next);
            }} />
          </>
        ) : null}

        <Pressable
          accessibilityRole="button" accessibilityState={{ expanded: planExpanded }}
          onPress={() => setPlanExpanded((expanded) => !expanded)} style={styles.disclosure}>
          <ThemedText type="rowTitle">Plan for obstacles (optional)</ThemedText>
          <ThemedText type="small" themeColor="accent">{planExpanded ? 'Hide' : 'Add a plan'}</ThemedText>
        </Pressable>
        {planExpanded ? (
          <>
            <FormField label="What might get in the way?" value={obstacle} onChangeText={setObstacle} placeholder="e.g. Being too tired to read" multiline />
            <FormField label="What will you do then?" value={ifThen} onChangeText={setIfThen} placeholder="e.g. Read one page before bed" multiline />
          </>
        ) : null}
      </View>
      {attempted && !valid ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {titleError ?? targetError ?? unitError ?? startError ?? 'A deadline could not be calculated on this device.'}
        </ThemedText>
      ) : null}
      {saveError ? <ThemedText type="small" themeColor="danger" role="alert">{saveError}</ThemedText> : null}
      <AppButton onPress={save} busy={saving} busyLabel="Saving…" style={styles.submit}>
        {editing ? 'Save changes' : 'Create goal'}
      </AppButton>
    </FormScreen>
  );
}

function horizonLabel(horizon: string | null): string {
  if (!horizon) return 'A deadline could not be calculated on this device.';
  const parts = hijriParts(horizon);
  return parts ? `By the end of ${parts.monthName} ${parts.year}` : `Deadline: ${horizon}`;
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two },
  headerAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three },
  section: { marginTop: Spacing.three },
  pair: { flexDirection: 'row', gap: Spacing.three },
  half: { flex: 1, gap: Spacing.two },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  disclosure: { marginTop: Spacing.three, minHeight: 48, justifyContent: 'center', gap: Spacing.one },
  submit: { marginTop: Spacing.three },
});
