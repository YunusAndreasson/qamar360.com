import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { Segmented } from '@/components/segmented';
import { SelectablePill } from '@/components/selectable-pill';
import { ThemedText } from '@/components/themed-text';
import { WeekdayPicker } from '@/components/weekday-picker';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import type { Habit, HabitCreate, HabitPatch } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import { DAILY_SCHEDULE, type HijriSchedule } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { isDuplicateName } from '@/lib/names';

/** The White Days of every Hijri month (Ayyām al-Bīḍ) — the one-tap monthly fill. */
const WHITE_DAYS = [13, 14, 15];

/** Named Hijri occasions offered as one-tap toggles (each contributes months and/or dates). */
const HIJRI_OCCASIONS: { key: string; label: string; months: number[]; dates: { month: number; day: number }[] }[] = [
  { key: 'ramadan', label: 'Ramaḍān', months: [9], dates: [] },
  { key: 'arafah', label: 'Day of ʿArafah', months: [], dates: [{ month: 12, day: 9 }] },
  { key: 'ashura', label: 'ʿĀshūrāʾ (9–10 Muḥarram)', months: [], dates: [{ month: 1, day: 9 }, { month: 1, day: 10 }] },
];

const dateKey = (d: { month: number; day: number }) => `${d.month}-${d.day}`;

/**
 * Add/remove `value` from a Set-state, with the standard selection tick. Shared by the weekday and
 * month-day pickers, which each toggle one number in and out of their Set the same way.
 */
function toggleInSet<T>(setter: (update: (prev: Set<T>) => Set<T>) => void, value: T) {
  haptics.selection();
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}

type Props = {
  /** The habit being edited, or `null` to create a new one. */
  habit: Habit | null;
  /** {@link normalizeName}-folded names of the user's *other* habits — used to reject duplicates. */
  existingNames: string[];
  /** Name of the stack this habit belongs to, or null. Editing only. */
  stackName?: string | null;
  /** What this deed is called on the surfaces around the form. Inside a stack it is an **act** —
   *  one deed of a sequence, which is the word the card rows, the options sheet and Discover all
   *  use. Standing on its own it is a **habit**, which is what the "+" menu offered to make. */
  noun?: 'act' | 'habit';
  /** Edit the stack this habit already belongs to. Editing only. */
  onEditStack?: () => void;
  onClose: () => void;
  onCreate: (input: HabitCreate) => void;
  onSave: (id: string, patch: HabitPatch) => void;
  onDelete: (id: string) => void;
};

/**
 * The new/edit-habit form. Presented as a native modal route (`habits/editor`),
 * so it carries no `<Modal>` of its own — Cancel/Save live in the native nav bar
 * via an in-screen `<Stack.Screen>` that reads this form's live validity.
 */
export function HabitEditorForm({
  habit,
  existingNames,
  stackName,
  noun = 'act',
  onEditStack,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: Props) {
  const theme = useTheme();
  const isNew = !habit;

  const initialHijri = habit?.hijri_schedule ?? null;

  const [name, setName] = useState(habit?.name ?? '');
  // Goal: a single daily act ('once'), or a count toward a numeric daily target ('count').
  const [goalMode, setGoalMode] = useState<'once' | 'count'>(habit?.target_count != null ? 'count' : 'once');
  const [targetText, setTargetText] = useState(habit?.target_count != null ? String(habit.target_count) : '3');
  const [unit, setUnit] = useState(habit?.target_unit ?? '');
  const [scheduleMode, setScheduleMode] = useState<'weekly' | 'hijri'>(initialHijri ? 'hijri' : 'weekly');
  const [days, setDays] = useState<Set<number>>(() => new Set(habit?.schedule_days ?? DAILY_SCHEDULE));
  // Hijri schedule, split into its three independent pieces for easy toggling. `dates` keys are
  // "month-day" strings so they live in a Set; rebuilt into a HijriSchedule on save.
  const [monthDays, setMonthDays] = useState<Set<number>>(() => new Set(initialHijri?.monthDays ?? []));
  const [months, setMonths] = useState<Set<number>>(() => new Set(initialHijri?.months ?? []));
  const [hijriDates, setHijriDates] = useState<Set<string>>(
    () => new Set((initialHijri?.dates ?? []).map(dateKey)),
  );

  const trimmedName = name.trim();
  // Reject a name that matches another habit — no DB constraint enforces this, so two
  // identical rows would otherwise be indistinguishable.
  const isDuplicate = useMemo(() => isDuplicateName(trimmedName, existingNames), [trimmedName, existingNames]);
  const hijriValid = monthDays.size > 0 || months.size > 0 || hijriDates.size > 0;
  // A count goal needs a whole-number target ≥ 1; 'once' carries no target.
  const targetCount = Number.parseInt(targetText, 10);
  const targetValid = Number.isInteger(targetCount) && targetCount >= 1;
  const canSave =
    trimmedName.length > 0 &&
    !isDuplicate &&
    (scheduleMode === 'weekly' ? days.size > 0 : hijriValid) &&
    (goalMode === 'once' || targetValid);

  const toggleMonthDay = (d: number) => toggleInSet(setMonthDays, d);

  // White Days (13–15) as a single quick-fill chip — on only when all three are selected.
  const whiteDaysOn = WHITE_DAYS.every((d) => monthDays.has(d));
  const toggleWhiteDays = () => {
    haptics.selection();
    setMonthDays((prev) => {
      const next = new Set(prev);
      WHITE_DAYS.forEach((d) => (whiteDaysOn ? next.delete(d) : next.add(d)));
      return next;
    });
  };

  // A named occasion is "on" when all its months and dates are present; toggling flips them.
  const occasionOn = (occ: (typeof HIJRI_OCCASIONS)[number]) =>
    occ.months.every((m) => months.has(m)) && occ.dates.every((d) => hijriDates.has(dateKey(d)));
  const toggleOccasion = (occ: (typeof HIJRI_OCCASIONS)[number]) => {
    haptics.selection();
    const on = occasionOn(occ);
    if (occ.months.length) {
      setMonths((prev) => {
        const next = new Set(prev);
        occ.months.forEach((m) => (on ? next.delete(m) : next.add(m)));
        return next;
      });
    }
    if (occ.dates.length) {
      setHijriDates((prev) => {
        const next = new Set(prev);
        occ.dates.forEach((d) => (on ? next.delete(dateKey(d)) : next.add(dateKey(d))));
        return next;
      });
    }
  };

  // Reassemble the three pieces into the stored HijriSchedule (null when nothing is picked).
  const buildHijriSchedule = (): HijriSchedule | null => {
    const hs: HijriSchedule = {};
    if (monthDays.size) hs.monthDays = [...monthDays].sort((a, b) => a - b);
    if (months.size) hs.months = [...months].sort((a, b) => a - b);
    if (hijriDates.size) {
      hs.dates = [...hijriDates]
        .map((k) => {
          const [m = 0, d = 0] = k.split('-').map(Number);
          return { month: m, day: d };
        })
        .sort((a, b) => a.month - b.month || a.day - b.day);
    }
    return hs.monthDays || hs.months || hs.dates ? hs : null;
  };

  const save = () => {
    if (!canSave) return;
    // A habit is weekly OR Hijri — the unused side is cleared so switching modes can't leave
    // stale data (empty schedule_days for Hijri, null hijri_schedule for weekly).
    const fields =
      scheduleMode === 'hijri'
        ? { schedule_days: [], hijri_schedule: buildHijriSchedule() }
        : { schedule_days: [...days].sort((a, b) => a - b), hijri_schedule: null };
    // A count goal carries its target + optional unit; 'once' clears both so switching back
    // to a plain binary habit can't leave a stale target behind.
    const goalFields =
      goalMode === 'count'
        ? { target_count: targetCount, target_unit: unit.trim() || null }
        : { target_count: null, target_unit: null };
    if (habit) {
      // Editing in place is an adjustment, not a new commit — silent, like renaming a stack.
      onSave(habit.id, { name: trimmedName, ...fields, ...goalFields });
    } else {
      onCreate({ name: trimmedName, ...fields, ...goalFields });
      // The same crisp "commit" as creating a stack or adding from Discover — every way a
      // habit enters the list confirms with one texture.
      haptics.added();
    }
    onClose();
  };

  const confirmDelete = () => {
    if (!habit) return;
    // Don't call onClose() here. Deleting removes the habit from state, which makes the editor
    // screen's "habit no longer exists" effect navigate back. Calling both fires router.back()
    // twice — the second has nothing to pop and logs "The action 'GO_BACK' was not handled…".
    confirmDestructive({
      title: `Delete ${noun}`,
      message: `Delete “${habit.name}”? This can’t be undone.`,
      onConfirm: () => {
        // The soft "release" — the counterpart of deleting a stack, so destruction always
        // confirms with the same texture.
        haptics.removed();
        onDelete(habit.id);
      },
    });
  };

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          // "Act" inside a stack — one deed of a sequence, the word every other surface uses for it
          // (the card rows, the options sheet, Discover) — and "habit" when it stands on its own,
          // matching the "+" menu's card. Sentence case, like every other title in this stack.
          title: `${isNew ? 'New' : 'Edit'} ${noun}`,
          // A new one is created, an existing one saved — the verb every editor uses for each.
          ...formHeaderActions({ onCancel: onClose, onSave: save, canSave, saveLabel: isNew ? 'Create' : 'Save' }),
        }}
      />

      {/* Name */}
      <FormField
        label="Name"
        value={name}
        onChangeText={setName}
        // An example, not a restatement of the label: it shows the house style in one glance —
        // past tense, first person, one specific deed — which "Habit name" never taught.
        placeholder="e.g. Read a page of Qurʾān"
        autoCapitalize="sentences"
        autoFocus={isNew}
        accessibilityLabel="Act name"
        error={isDuplicate ? 'You already use that name.' : undefined}
      />

      {/* Target — a single daily act, or counting toward a numeric target (e.g. 5 pages). Not
          "Goal": that word belongs to the Goals feature, a horizon over many days, and one field
          here wearing it made the two read as the same thing. The shared Segmented control, so
          this mode choice reads exactly like Settings'. */}
      <FieldLabel>Target</FieldLabel>
      <Segmented
        options={[
          { value: 'once', label: 'Once daily' },
          { value: 'count', label: 'Count', accessibilityLabel: 'Count target' },
        ]}
        value={goalMode}
        onChange={setGoalMode}
        style={styles.modeRow}
      />
      {goalMode === 'count' ? (
        // Each box in its own wrapper: `FormField` is a field *plus* its optional caption and hint,
        // so the width (and the unit's flex) has to sit on a view that holds all of it — set on
        // the input itself, `flex: 1` landed inside a wrapper that never grew.
        <View style={styles.goalCountRow}>
          <View style={styles.targetBox}>
            <FormField
              value={targetText}
              onChangeText={(t) => setTargetText(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="3"
              maxLength={4}
              accessibilityLabel="Daily target count"
              style={styles.targetInput}
            />
          </View>
          <View style={styles.unitBox}>
            <FormField
              value={unit}
              onChangeText={setUnit}
              placeholder="Unit, e.g. pages or cups (optional)"
              autoCapitalize="none"
              maxLength={24}
              accessibilityLabel="Count unit"
            />
          </View>
        </View>
      ) : null}

      {/* Schedule */}
      <FieldLabel>Repeat</FieldLabel>
      {/* Weekly (weekdays) vs Hijri (lunar dates) — the two schedule kinds. */}
      <Segmented
        options={[
          { value: 'weekly', label: 'Weekly', accessibilityLabel: 'Weekly schedule' },
          { value: 'hijri', label: 'Hijri', accessibilityLabel: 'Hijri schedule' },
        ]}
        value={scheduleMode}
        onChange={setScheduleMode}
        style={styles.modeRow}
      />

      {scheduleMode === 'weekly' ? (
        <WeekdayPicker days={days} onChange={setDays} />
      ) : (
        <>
          {/* Days of every Hijri month — with a one-tap White Days (13–15) fill. */}
          <FieldLabel style={styles.subLabel}>Each Hijri month</FieldLabel>
          <SelectablePill
            selected={whiteDaysOn}
            label="White Days (13–15)"
            onPress={toggleWhiteDays}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: whiteDaysOn }}
            accessibilityLabel="White Days, 13 to 15"
            style={styles.occasionPill}
          />
          <View style={styles.monthDayGrid}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
              <SelectablePill
                key={d}
                selected={monthDays.has(d)}
                label={String(d)}
                textType="small"
                onPress={() => toggleMonthDay(d)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: monthDays.has(d) }}
                accessibilityLabel={`Day ${d}`}
                // 40×36 cell → ≥44pt effective target; the grid's 8pt gaps absorb the ±2/±4.
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                style={styles.monthDay}
              />
            ))}
          </View>

          {/* Annual occasions — Ramadan, ʿArafah, ʿĀshūrāʾ. */}
          <FieldLabel style={styles.subLabel}>Occasions</FieldLabel>
          <View style={styles.occasions}>
            {HIJRI_OCCASIONS.map((occ) => (
              <SelectablePill
                key={occ.key}
                selected={occasionOn(occ)}
                label={occ.label}
                onPress={() => toggleOccasion(occ)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: occasionOn(occ) }}
                accessibilityLabel={occ.label}
                style={styles.occasionPill}
              />
            ))}
          </View>
          {!hijriValid ? (
            <ThemedText type="small" themeColor="danger" style={styles.hint}>
              Pick at least one Hijri day or occasion.
            </ThemedText>
          ) : null}
        </>
      )}

      {/* Stack (editing only) — this habit's grouping, with a shortcut to edit it. New stacks
          aren't made here; you start one on Today by dropping one habit onto another. */}
      {!isNew && stackName ? (
        <>
          <FieldLabel>Stack</FieldLabel>
          <Pressable
            onPress={onEditStack}
            accessibilityRole="button"
            accessibilityLabel={`In stack ${stackName}. Edit Stack.`}
            style={({ pressed }) => [
              styles.stackRow,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              pressed && styles.stackRowPressed,
            ]}>
            <AppIcon name="link" color={theme.accent} />
            <ThemedText type="default" style={styles.stackName} numberOfLines={1}>
              {stackName}
            </ThemedText>
            <ThemedText type="small" themeColor="accent" style={styles.stackAction}>
              Edit
            </ThemedText>
          </Pressable>
        </>
      ) : null}

      {/* Delete (editing only) */}
      {habit ? (
        <AppButton
          variant="destructive"
          onPress={confirmDelete}
          style={styles.delete}>
          {`Delete ${noun}`}
        </AppButton>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: Spacing.one },
  modeRow: { marginTop: Spacing.one },
  goalCountRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, marginTop: Spacing.two },
  targetBox: { width: 72 },
  targetInput: { textAlign: 'center' },
  unitBox: { flex: 1 },
  subLabel: { marginTop: Spacing.three },
  monthDayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  monthDay: { width: 40, height: 36, paddingHorizontal: 0, paddingVertical: 0 },
  occasions: { marginTop: Spacing.one },
  occasionPill: { alignSelf: 'flex-start', minHeight: 44, marginTop: Spacing.two },
  stackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  stackRowPressed: { opacity: Pressed.dim },
  stackName: { flex: 1 },
  // Width floor for the row's trailing action — Android's flex-row text measurement runs a few
  // px short of the render width, so without the floor the label's last word wraps to a clipped
  // second line ("Add to a stack" → "Add to a"). Same fix as the toast's Undo.
  stackAction: { minWidth: 108, flexShrink: 0, textAlign: 'right' },
  delete: {
    marginTop: Spacing.four,
  },
});
