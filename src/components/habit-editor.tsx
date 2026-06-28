import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { PressableScale } from '@/components/pressable-scale';
import { SelectablePill } from '@/components/selectable-pill';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import type { Habit, HabitCreate, HabitPatch } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import {
  DAILY_SCHEDULE,
  formatReminderTime,
  type HijriSchedule,
  parseReminderTime,
  WEEKDAY_LABELS,
} from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { ensurePermission, remindersAvailable } from '@/lib/notifications';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The White Days of every Hijri month (Ayyām al-Bīḍ) — the one-tap monthly fill. */
const WHITE_DAYS = [13, 14, 15];

/** Named Hijri occasions offered as one-tap toggles (each contributes months and/or dates). */
const HIJRI_OCCASIONS: { key: string; label: string; months: number[]; dates: { month: number; day: number }[] }[] = [
  { key: 'ramadan', label: 'Ramadan', months: [9], dates: [] },
  { key: 'arafah', label: 'Day of ʿArafah', months: [], dates: [{ month: 12, day: 9 }] },
  { key: 'ashura', label: 'ʿĀshūrāʾ (9–10 Muḥarram)', months: [], dates: [{ month: 1, day: 9 }, { month: 1, day: 10 }] },
];

const dateKey = (d: { month: number; day: number }) => `${d.month}-${d.day}`;

type Props = {
  /** The habit being edited, or `null` to create a new one. */
  habit: Habit | null;
  /** Lower-cased, trimmed names of the user's *other* habits — used to reject duplicates. */
  existingNames: string[];
  /** Name of the stack this habit belongs to, or null. Editing only. */
  stackName?: string | null;
  /** Existing stacks the habit could join — shown in the picker when it isn't grouped yet. */
  joinableStacks?: { id: string; name: string }[];
  /** Add this habit to an existing stack. Editing only. */
  onJoinStack?: (stackId: string) => void;
  /** Start a new stack seeded with this habit. Editing only — also enables the STACK section. */
  onNewStack?: () => void;
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
  onNewStack,
  onEditStack,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: Props) {
  const theme = useTheme();
  const isNew = !habit;
  const initialTime = parseReminderTime(habit?.reminder_time);

  const initialHijri = habit?.hijri_schedule ?? null;

  const [name, setName] = useState(habit?.name ?? '');
  const [scheduleMode, setScheduleMode] = useState<'weekly' | 'hijri'>(initialHijri ? 'hijri' : 'weekly');
  const [days, setDays] = useState<Set<number>>(() => new Set(habit?.schedule_days ?? DAILY_SCHEDULE));
  // Hijri schedule, split into its three independent pieces for easy toggling. `dates` keys are
  // "month-day" strings so they live in a Set; rebuilt into a HijriSchedule on save.
  const [monthDays, setMonthDays] = useState<Set<number>>(() => new Set(initialHijri?.monthDays ?? []));
  const [months, setMonths] = useState<Set<number>>(() => new Set(initialHijri?.months ?? []));
  const [hijriDates, setHijriDates] = useState<Set<string>>(
    () => new Set((initialHijri?.dates ?? []).map(dateKey)),
  );
  const [reminderOn, setReminderOn] = useState(!!initialTime);
  const [hour, setHour] = useState(initialTime?.hour ?? 8);
  const [minute, setMinute] = useState(initialTime?.minute ?? 0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [stackPickerOpen, setStackPickerOpen] = useState(false);

  const timeAsDate = useMemo(() => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  }, [hour, minute]);

  const trimmedName = name.trim();
  // Reject a name that matches another habit (case-insensitive) — no DB constraint
  // enforces this, so two identical rows would otherwise be indistinguishable.
  const isDuplicate = useMemo(
    () => trimmedName.length > 0 && existingNames.includes(trimmedName.toLowerCase()),
    [trimmedName, existingNames],
  );
  const hijriValid = monthDays.size > 0 || months.size > 0 || hijriDates.size > 0;
  const canSave =
    trimmedName.length > 0 && !isDuplicate && (scheduleMode === 'weekly' ? days.size > 0 : hijriValid);

  const toggleDay = (d: number) => {
    haptics.selection();
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const toggleMonthDay = (d: number) => {
    haptics.selection();
    setMonthDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

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

  const onToggleReminder = async (value: boolean) => {
    if (value) {
      const granted = await ensurePermission();
      if (!granted) {
        setPermissionDenied(true);
        return; // stay off — can't schedule without permission
      }
      setPermissionDenied(false);
    } else {
      setPickerVisible(false);
    }
    // No manual haptic: this is a native `Switch`, which already provides the platform's
    // own toggle feedback (a double-buzz otherwise on iOS).
    setReminderOn(value);
  };

  // Apply a picked time. Fired continuously by the iOS spinner and once by the Android dialog.
  const onChangeTime = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'set' && date) {
      setHour(date.getHours());
      setMinute(date.getMinutes());
    }
  };

  // iOS renders the spinner inline (toggled here); Android uses the library's imperative
  // dialog — the recommended pattern for `@react-native-community/datetimepicker` v9.
  const openTimePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: timeAsDate, mode: 'time', onChange: onChangeTime });
    } else {
      setPickerVisible((v) => !v);
    }
  };

  const save = () => {
    if (!canSave) return;
    const reminder_time = reminderOn ? formatReminderTime(hour, minute) : null;
    // A habit is weekly OR Hijri — the unused side is cleared so switching modes can't leave
    // stale data (empty schedule_days for Hijri, null hijri_schedule for weekly).
    const fields =
      scheduleMode === 'hijri'
        ? { schedule_days: [], hijri_schedule: buildHijriSchedule() }
        : { schedule_days: [...days].sort((a, b) => a - b), hijri_schedule: null };
    if (habit) onSave(habit.id, { name: trimmedName, reminder_time, ...fields });
    else onCreate({ name: trimmedName, reminder_time, ...fields });
    onClose();
  };

  const confirmDelete = () => {
    if (!habit) return;
    Alert.alert('Delete habit', `Delete “${habit.name}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        // Don't call onClose() here. Deleting removes the habit from state, which
        // makes the editor screen's "habit no longer exists" effect navigate back.
        // Calling both fires router.back() twice — the second has nothing to pop
        // and logs "The action 'GO_BACK' was not handled by any navigator."
        onPress: () => onDelete(habit.id),
      },
    ]);
  };

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: isNew ? 'New Habit' : 'Edit Habit',
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
        placeholder="Habit name"
        autoCapitalize="sentences"
        autoFocus={isNew}
        accessibilityLabel="Habit name"
        error={isDuplicate ? 'You already have a habit with this name.' : undefined}
      />

      {/* Schedule */}
      <FieldLabel>REPEAT</FieldLabel>
      {/* Weekly (weekdays) vs Hijri (lunar dates) — the two schedule kinds. */}
      <View style={styles.modeRow}>
        {(['weekly', 'hijri'] as const).map((mode) => (
          <SelectablePill
            key={mode}
            selected={scheduleMode === mode}
            label={mode === 'weekly' ? 'Weekly' : 'Hijri'}
            onPress={() => {
              haptics.selection();
              setScheduleMode(mode);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: scheduleMode === mode }}
            accessibilityLabel={mode === 'weekly' ? 'Weekly schedule' : 'Hijri schedule'}
            style={styles.modePill}
          />
        ))}
      </View>

      {scheduleMode === 'weekly' ? (
        <>
          <View style={styles.days}>
            {WEEKDAY_LABELS.map((label, d) => (
              <SelectablePill
                key={d}
                selected={days.has(d)}
                label={label}
                onPress={() => toggleDay(d)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: days.has(d) }}
                accessibilityLabel={WEEKDAY_NAMES[d]}
                hitSlop={{ top: 6, bottom: 6 }}
                style={styles.day}
              />
            ))}
          </View>
          {days.size === 0 ? (
            <ThemedText type="small" themeColor="danger" style={styles.hint}>
              Pick at least one day.
            </ThemedText>
          ) : null}
        </>
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
                hitSlop={{ top: 6, bottom: 6 }}
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

      {/* Reminder — opt-in. Off by default; a habit carries no reminder until set here. */}
      <View style={styles.reminderRow}>
        <FieldLabel>REMINDER</FieldLabel>
        {remindersAvailable ? (
          <Switch
            value={reminderOn}
            onValueChange={onToggleReminder}
            trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
            ios_backgroundColor={theme.backgroundSelected}
            accessibilityLabel="Reminder"
          />
        ) : null}
      </View>
      {!remindersAvailable ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Reminders need a development build (not available in Expo Go).
        </ThemedText>
      ) : null}
      {remindersAvailable && reminderOn ? (
        <PressableScale
          onPress={openTimePicker}
          accessibilityRole="button"
          accessibilityLabel="Reminder time"
          style={[styles.timeChip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText type="smallBold">
            {timeAsDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </ThemedText>
        </PressableScale>
      ) : null}
      {permissionDenied ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Allow notifications in system settings to get reminders.
        </ThemedText>
      ) : null}
      {/* iOS shows the spinner inline; Android opens the native dialog imperatively. */}
      {remindersAvailable && pickerVisible && Platform.OS === 'ios' ? (
        <View>
          <DateTimePicker value={timeAsDate} mode="time" display="spinner" onChange={onChangeTime} />
          <PressableScale onPress={() => setPickerVisible(false)} style={styles.pickerDone} accessibilityRole="button">
            <ThemedText type="smallBold" themeColor="accent">
              Done
            </ThemedText>
          </PressableScale>
        </View>
      ) : null}

      {/* Stack (editing only) — group this habit into a sequence with others. */}
      {onNewStack ? (
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
              <MaterialIcons name="link" size={22} color={theme.accent} />
              <ThemedText type="default" style={styles.stackName} numberOfLines={1}>
                {stackName}
              </ThemedText>
              <ThemedText type="small" themeColor="accent">
                Edit
              </ThemedText>
            </Pressable>
          ) : (
            // Not grouped — a tappable picker: join an existing stack, or start a new one.
            <View style={[styles.stackGroup, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Pressable
                // Disclosure of the stack picker — clear visual feedback, no haptic.
                onPress={() => setStackPickerOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: stackPickerOpen }}
                accessibilityLabel="Add to a stack"
                style={({ pressed }) => [styles.stackHeaderRow, pressed && styles.stackRowPressed]}>
                <MaterialIcons name="link" size={22} color={theme.accent} />
                <ThemedText type="default" style={styles.stackName} numberOfLines={1}>
                  Not in a stack
                </ThemedText>
                <ThemedText type="small" themeColor="accent">
                  {stackPickerOpen ? 'Close' : 'Add to a stack'}
                </ThemedText>
              </Pressable>
              {stackPickerOpen ? (
                <>
                  {(joinableStacks ?? []).map((s) => (
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
                      <MaterialIcons name="add" size={22} color={theme.accent} />
                      <ThemedText type="default" style={styles.stackName} numberOfLines={1}>
                        {s.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={onNewStack}
                    android_ripple={{ color: theme.backgroundSelected }}
                    accessibilityRole="button"
                    accessibilityLabel="Start a new stack with this habit"
                    style={({ pressed }) => [
                      styles.stackOption,
                      { borderTopColor: theme.border },
                      pressed && styles.stackRowPressed,
                    ]}>
                    <MaterialIcons name="add-link" size={22} color={theme.accent} />
                    <ThemedText type="smallBold" themeColor="accent">
                      New Stack…
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}
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
  day: { width: 40, height: 40, borderRadius: 20, paddingHorizontal: 0, paddingVertical: 0 },
  hint: { marginTop: Spacing.one },
  modeRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  modePill: { flex: 1, minHeight: 44 },
  subLabel: { marginTop: Spacing.three },
  monthDayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  monthDay: { width: 40, height: 36, paddingHorizontal: 0, paddingVertical: 0 },
  occasions: { marginTop: Spacing.one },
  occasionPill: { alignSelf: 'flex-start', minHeight: 44, marginTop: Spacing.two },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  timeChip: {
    alignSelf: 'flex-start',
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pickerDone: { alignSelf: 'flex-end', padding: Spacing.two },
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
  delete: {
    marginTop: Spacing.four,
  },
});
