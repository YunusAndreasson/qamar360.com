import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Habit, HabitPatch } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { formatReminderTime, parseReminderTime, WEEKDAY_LABELS } from '@/lib/dates';
import { ensurePermission, remindersAvailable } from '@/lib/notifications';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Props = {
  /** The habit being edited. Mount this component with `key={habit.id}` so the form resets per habit. */
  habit: Habit;
  onClose: () => void;
  onSave: (id: string, patch: HabitPatch) => void;
  onDelete: (id: string) => void;
};

export function HabitEditor({ habit, onClose, onSave, onDelete }: Props) {
  const theme = useTheme();
  const initialTime = parseReminderTime(habit.reminder_time);

  const [name, setName] = useState(habit.name);
  const [days, setDays] = useState<Set<number>>(() => new Set(habit.schedule_days));
  const [reminderOn, setReminderOn] = useState(!!initialTime);
  const [hour, setHour] = useState(initialTime?.hour ?? 8);
  const [minute, setMinute] = useState(initialTime?.minute ?? 0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const timeAsDate = useMemo(() => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  }, [hour, minute]);

  const canSave = name.trim().length > 0 && days.size > 0;

  const toggleDay = (d: number) =>
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

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
    setReminderOn(value);
  };

  const save = () => {
    if (!canSave) return;
    onSave(habit.id, {
      name: name.trim(),
      schedule_days: [...days].sort((a, b) => a - b),
      reminder_time: reminderOn ? formatReminderTime(hour, minute) : null,
    });
    onClose();
  };

  const confirmDelete = () =>
    Alert.alert('Delete habit', `Delete “${habit.name}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete(habit.id);
          onClose();
        },
      },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close editor" />
      <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText type="smallBold">Edit habit</ThemedText>
          <Pressable onPress={save} disabled={!canSave} accessibilityRole="button" hitSlop={8}>
            <ThemedText type="smallBold" style={{ color: canSave ? theme.accent : theme.textSecondary }}>
              Save
            </ThemedText>
          </Pressable>
        </View>

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
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
          accessibilityLabel="Habit name"
        />

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

        {/* Delete */}
        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          style={[styles.delete, { backgroundColor: theme.dangerSubtle }]}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            Delete habit
          </ThemedText>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  fieldLabel: { letterSpacing: 0.5, marginTop: Spacing.two },
  input: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
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
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pickerDone: { alignSelf: 'flex-end', padding: Spacing.two },
  delete: {
    marginTop: Spacing.four,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
