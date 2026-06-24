import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import type { Habit, HabitCreate, HabitPatch } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { DAILY_SCHEDULE, formatReminderTime, parseReminderTime, WEEKDAY_LABELS } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { ensurePermission, remindersAvailable } from '@/lib/notifications';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Quick-add suggestions for a new habit — common Islamic practices. Tapping one prefills the name. */
const HABIT_SUGGESTIONS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Quran', 'Dhikr', 'Istighfar', 'Duha', 'Sadaqah'];

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

  const [name, setName] = useState(habit?.name ?? '');
  const [days, setDays] = useState<Set<number>>(() => new Set(habit?.schedule_days ?? DAILY_SCHEDULE));
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
  const canSave = trimmedName.length > 0 && days.size > 0 && !isDuplicate;

  const toggleDay = (d: number) => {
    haptics.selection();
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
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
    haptics.selection();
    setReminderOn(value);
  };

  const save = () => {
    if (!canSave) return;
    const reminder_time = reminderOn ? formatReminderTime(hour, minute) : null;
    const schedule_days = [...days].sort((a, b) => a - b);
    if (habit) onSave(habit.id, { name: trimmedName, schedule_days, reminder_time });
    else onCreate({ name: trimmedName, schedule_days, reminder_time });
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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: isNew ? 'New habit' : 'Edit habit',
          // Center the title so it doesn't crowd the "Cancel" button on Android's
          // left-aligned header (iOS centers it already).
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={save} disabled={!canSave} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="smallBold" style={{ color: canSave ? theme.accent : theme.textSecondary }}>
                Save
              </ThemedText>
            </Pressable>
          ),
        }}
      />

      {/* Name */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        NAME
      </ThemedText>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Habit name"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="sentences"
        autoFocus={isNew}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
        accessibilityLabel="Habit name"
      />
      {isDuplicate ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.danger }]}>
          You already have a habit with this name.
        </ThemedText>
      ) : null}

      {/* Quick-add suggestions (new habits only) — tap to prefill the name. */}
      {isNew ? (
        <View style={styles.suggestions}>
          {HABIT_SUGGESTIONS.map((suggestion) => {
            const on = name.trim() === suggestion;
            return (
              <Pressable
                key={suggestion}
                onPress={() => {
                  haptics.selection();
                  setName(suggestion);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Use ${suggestion}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? theme.accent : theme.backgroundElement,
                    borderColor: on ? theme.accent : theme.border,
                  },
                ]}>
                <ThemedText type="small" style={{ color: on ? theme.accentText : theme.text }}>
                  {suggestion}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Schedule */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        REPEAT
      </ThemedText>
      <View style={styles.days}>
        {WEEKDAY_LABELS.map((label, d) => {
          const on = days.has(d);
          return (
            <Pressable
              key={d}
              onPress={() => toggleDay(d)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={WEEKDAY_NAMES[d]}
              style={[
                styles.day,
                {
                  backgroundColor: on ? theme.accent : theme.backgroundElement,
                  borderColor: on ? theme.accent : theme.border,
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: on ? theme.accentText : theme.textSecondary }}>
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {days.size === 0 ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.danger }]}>
          Pick at least one day.
        </ThemedText>
      ) : null}

      {/* Reminder */}
      <View style={styles.reminderRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
          REMINDER
        </ThemedText>
        {remindersAvailable ? (
          <Switch
            value={reminderOn}
            onValueChange={onToggleReminder}
            trackColor={{ true: theme.accent }}
            accessibilityLabel="Reminder"
          />
        ) : null}
      </View>
      {!remindersAvailable ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.textSecondary }]}>
          Reminders need a development build (not available in Expo Go).
        </ThemedText>
      ) : null}
      {remindersAvailable && reminderOn ? (
        <Pressable
          onPress={() => setPickerVisible((v) => !v)}
          accessibilityRole="button"
          style={[styles.timeChip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText type="smallBold">
            {timeAsDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </ThemedText>
        </Pressable>
      ) : null}
      {permissionDenied ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.textSecondary }]}>
          Allow notifications in system settings to get reminders.
        </ThemedText>
      ) : null}
      {remindersAvailable && pickerVisible ? (
        <View>
          <DateTimePicker
            value={timeAsDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, date) => {
              if (Platform.OS !== 'ios') setPickerVisible(false);
              if (event.type === 'set' && date) {
                setHour(date.getHours());
                setMinute(date.getMinutes());
              } else if (event.type === 'dismissed') {
                setPickerVisible(false);
              }
            }}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setPickerVisible(false)} style={styles.pickerDone} accessibilityRole="button">
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Done
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Stack (editing only) — group this habit into a sequence with others. */}
      {onNewStack ? (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
            STACK
          </ThemedText>
          {stackName ? (
            // Already grouped — show the stack and a shortcut to edit it.
            <Pressable
              onPress={onEditStack}
              accessibilityRole="button"
              accessibilityLabel={`In stack ${stackName}. Edit stack.`}
              style={({ pressed }) => [
                styles.stackRow,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                pressed && styles.stackRowPressed,
              ]}>
              <MaterialIcons name="link" size={20} color={theme.accent} />
              <ThemedText type="default" style={styles.stackName} numberOfLines={1}>
                {stackName}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.accent }}>
                Edit
              </ThemedText>
            </Pressable>
          ) : (
            // Not grouped — a tappable picker: join an existing stack, or start a new one.
            <View style={[styles.stackGroup, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Pressable
                onPress={() => {
                  haptics.selection();
                  setStackPickerOpen((v) => !v);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: stackPickerOpen }}
                accessibilityLabel="Add to a stack"
                style={({ pressed }) => [styles.stackHeaderRow, pressed && styles.stackRowPressed]}>
                <MaterialIcons name="link" size={20} color={theme.accent} />
                <ThemedText type="default" style={styles.stackName} numberOfLines={1}>
                  Not in a stack
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.accent }}>
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
                      <MaterialIcons name="add" size={20} color={theme.accent} />
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
                    <MaterialIcons name="add-link" size={20} color={theme.accent} />
                    <ThemedText type="smallBold" style={{ color: theme.accent }}>
                      New stack…
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
        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          style={[styles.delete, { backgroundColor: theme.dangerSubtle }]}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            Delete habit
          </ThemedText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  fieldLabel: { letterSpacing: 0.5, marginTop: Spacing.two },
  input: {
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  chip: {
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { marginTop: Spacing.one },
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
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
