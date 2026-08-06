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
import { normalizeName } from '@/lib/names';

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
  /** Existing stacks the habit could join — shown in the picker when it isn't grouped yet. */
  joinableStacks?: { id: string; name: string }[];
  /** Add this habit to an existing stack. Editing only. */
  onJoinStack?: (stackId: string) => void;
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
  joinableStacks,
  onJoinStack,
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
  const [stackPickerOpen, setStackPickerOpen] = useState(false);

  const trimmedName = name.trim();
  // Reject a name that matches another habit — no DB constraint enforces this, so two
  // identical rows would otherwise be indistinguishable. Folded through the SAME
  // normalizer as `existingNames` (stack-new/stack-rename do the same): comparing the
  // raw lower-cased name against the diacritic-stripped set would wave through
  // "Read 1 page of Qurʾān" as a "new" name beside an identical existing habit.
  const isDuplicate = useMemo(
    () => trimmedName.length > 0 && existingNames.includes(normalizeName(trimmedName)),
    [trimmedName, existingNames],
  );
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
      title: 'Delete act',
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
          // "Act", not "habit": inside a stack this is one deed of a sequence, and that is the
          // word every other surface uses for it (the card rows, the options sheet, Discover).
          // Sentence case, like every other title in this stack.
          title: isNew ? 'New act' : 'Edit act',
          // Center the title so it doesn't crowd the "Cancel" button on Android's
          // left-aligned header (iOS centers it already).
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: onClose, onSave: save, canSave }),
        }}
      />

      {/* Name */}
      <FormField
        label="NAME"
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

      {/* Goal — a single daily act, or counting toward a numeric target (e.g. 5 pages).
          The shared Segmented control, so this mode choice reads exactly like Settings'. */}
      <FieldLabel>GOAL</FieldLabel>
      <Segmented
        options={[
          { value: 'once', label: 'Once daily' },
          { value: 'count', label: 'Count', accessibilityLabel: 'Count goal' },
        ]}
        value={goalMode}
        onChange={setGoalMode}
        style={styles.modeRow}
      />
      {goalMode === 'count' ? (
        <View style={styles.goalCountRow}>
          <FormField
            value={targetText}
            onChangeText={(t) => setTargetText(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="3"
            maxLength={4}
            accessibilityLabel="Daily target count"
            style={styles.targetInput}
          />
          <FormField
            value={unit}
            onChangeText={setUnit}
            placeholder="unit — e.g. pages, cups (optional)"
            autoCapitalize="none"
            maxLength={24}
            accessibilityLabel="Count unit"
            style={styles.unitInput}
          />
        </View>
      ) : null}

      {/* Schedule */}
      <FieldLabel>REPEAT</FieldLabel>
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
          <FieldLabel style={styles.subLabel}>EACH HIJRI MONTH</FieldLabel>
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
          <FieldLabel style={styles.subLabel}>OCCASIONS</FieldLabel>
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

      {/* Stack (editing only) — this habit's grouping: edit the stack it's in, or join an
          existing one. Hidden when there's nothing to show or join — new stacks aren't made
          here; you start one on Today by dropping one habit onto another. */}
      {!isNew && (stackName || (joinableStacks?.length ?? 0) > 0) ? (
        <>
          <FieldLabel>STACK</FieldLabel>
          {stackName ? (
            // Already grouped — show the stack and a shortcut to edit it.
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
          ) : (
            // Not grouped — a tappable picker: join one of the existing stacks.
            <View style={[styles.stackGroup, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Pressable
                // Disclosure of the stack picker — clear visual feedback, no haptic.
                onPress={() => setStackPickerOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: stackPickerOpen }}
                accessibilityLabel="Add to a stack"
                style={({ pressed }) => [styles.stackHeaderRow, pressed && styles.stackRowPressed]}>
                <AppIcon name="link" color={theme.accent} />
                <ThemedText type="default" style={styles.stackName} numberOfLines={1}>
                  Not in a stack
                </ThemedText>
                <ThemedText type="small" themeColor="accent" style={styles.stackAction}>
                  {stackPickerOpen ? 'Close' : 'Add to a stack'}
                </ThemedText>
              </Pressable>
              {stackPickerOpen
                ? (joinableStacks ?? []).map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => onJoinStack?.(s.id)}
                      android_ripple={{ color: theme.backgroundSelected }}
                      accessibilityRole="button"
                      accessibilityLabel={`Add to ${s.name}`}
                      style={({ pressed }) => [
                        styles.stackOption,
                        { borderTopColor: theme.border },
                        pressed && styles.stackRowPressed,
                      ]}>
                      <AppIcon name="add" color={theme.accent} />
                      <ThemedText type="default" style={styles.stackName} numberOfLines={1}>
                        {s.name}
                      </ThemedText>
                    </Pressable>
                  ))
                : null}
            </View>
          )}
        </>
      ) : null}

      {/* Delete (editing only) */}
      {habit ? (
        <AppButton
          variant="destructive"
          onPress={confirmDelete}
          style={styles.delete}>
          Delete habit
        </AppButton>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  // Pill shape/size overrides; SelectablePill owns the border, radius, centring and colour.
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  day: { width: 40, height: 40, borderRadius: Radius.full, paddingHorizontal: 0, paddingVertical: 0 },
  hint: { marginTop: Spacing.one },
  modeRow: { marginTop: Spacing.one },
  goalCountRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, marginTop: Spacing.two },
  targetInput: { width: 72, textAlign: 'center' },
  unitInput: { flex: 1 },
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
  stackGroup: {
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stackHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  stackOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
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
