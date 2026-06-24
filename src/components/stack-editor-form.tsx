import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import type { Habit, HabitStack } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Props = {
  /** The stack being edited, or `null` to create a new one. */
  stack: HabitStack | null;
  /** All of the user's habits — the pool of selectable members. */
  habits: Habit[];
  /** Current members in sequence order (or a seed for a new stack). */
  initialMemberIds: string[];
  /** Lower-cased names of the user's *other* stacks — used to reject duplicates. */
  existingNames: string[];
  onClose: () => void;
  onCreate: (name: string, orderedMemberIds: string[]) => void;
  onSave: (id: string, patch: { name?: string; orderedMemberIds?: string[] }) => void;
  onDelete: (id: string) => void;
};

/**
 * The new/edit-stack form. A native modal route (`habits/stack-editor`); Cancel/Save live
 * in the native nav bar. Pick member habits, order them into a sequence, name the stack.
 * A stack only groups habits visually — completion stays per-habit.
 */
export function StackEditorForm({
  stack,
  habits,
  initialMemberIds,
  existingNames,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: Props) {
  const theme = useTheme();
  const isNew = !stack;

  const [name, setName] = useState(stack?.name ?? '');
  const [selected, setSelected] = useState<string[]>(initialMemberIds);

  const byId = useMemo(() => new Map(habits.map((h) => [h.id, h])), [habits]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Selectable additions: standalone habits and this stack's own members
  // (so a member removed mid-edit can be re-added), minus what's already selected.
  const available = useMemo(
    () =>
      habits.filter(
        (h) => (h.stack_id == null || h.stack_id === stack?.id) && !selectedSet.has(h.id) && !h.id.startsWith('temp-'),
      ),
    [habits, stack?.id, selectedSet],
  );

  const trimmedName = name.trim();
  const isDuplicate = useMemo(
    () => trimmedName.length > 0 && existingNames.includes(trimmedName.toLowerCase()),
    [trimmedName, existingNames],
  );
  // A stack needs a name and at least two habits to be a meaningful sequence.
  const canSave = trimmedName.length > 0 && !isDuplicate && selected.length >= 2;

  const add = (id: string) => {
    haptics.selection();
    setSelected((prev) => [...prev, id]);
  };
  const remove = (id: string) => {
    haptics.selection();
    setSelected((prev) => prev.filter((x) => x !== id));
  };
  const move = (index: number, delta: number) => {
    const j = index + delta;
    if (j < 0 || j >= selected.length) return;
    haptics.selection();
    setSelected((prev) => {
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const save = () => {
    if (!canSave) return;
    if (stack) onSave(stack.id, { name: trimmedName, orderedMemberIds: selected });
    else onCreate(trimmedName, selected);
    onClose();
  };

  const confirmDelete = () => {
    if (!stack) return;
    Alert.alert('Delete stack', `Delete “${stack.name}”? The habits stay; only the grouping is removed.`, [
      { text: 'Cancel', style: 'cancel' },
      // Don't call onClose() — deleting removes the stack from state, and the route's
      // "stack no longer exists" effect backs out. Calling both pops twice.
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(stack.id) },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: isNew ? 'New stack' : 'Edit stack',
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
        placeholder="e.g. Fajr routine"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="sentences"
        autoFocus={isNew}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        accessibilityLabel="Stack name"
      />
      {isDuplicate ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.danger }]}>
          You already have a stack with this name.
        </ThemedText>
      ) : null}

      {/* Sequence — the ordered members */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        SEQUENCE
      </ThemedText>
      {selected.length === 0 ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.textSecondary }]}>
          Add habits below to build the sequence.
        </ThemedText>
      ) : (
        <View style={[styles.group, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {selected.map((id, index) => {
            const habit = byId.get(id);
            if (!habit) return null;
            return (
              <View
                key={id}
                style={[styles.memberRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.ordinal}>
                  {index + 1}
                </ThemedText>
                <ThemedText type="default" style={styles.memberName} numberOfLines={1}>
                  {habit.name}
                </ThemedText>
                <Pressable
                  onPress={() => move(index, -1)}
                  disabled={index === 0}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${habit.name} up`}>
                  <MaterialIcons name="arrow-upward" size={20} color={index === 0 ? theme.border : theme.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={() => move(index, 1)}
                  disabled={index === selected.length - 1}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${habit.name} down`}>
                  <MaterialIcons
                    name="arrow-downward"
                    size={20}
                    color={index === selected.length - 1 ? theme.border : theme.textSecondary}
                  />
                </Pressable>
                <Pressable onPress={() => remove(id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove ${habit.name}`}>
                  <MaterialIcons name="close" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      {selected.length === 1 ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.textSecondary }]}>
          Add one more habit — a stack groups at least two.
        </ThemedText>
      ) : null}

      {/* Available habits to add */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        ADD A HABIT
      </ThemedText>
      {available.length === 0 ? (
        <ThemedText type="small" style={[styles.hint, { color: theme.textSecondary }]}>
          {habits.length === 0 ? 'Add some habits first.' : 'No more standalone habits to add.'}
        </ThemedText>
      ) : (
        <View style={[styles.group, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {available.map((habit, index) => (
            <Pressable
              key={habit.id}
              onPress={() => add(habit.id)}
              android_ripple={{ color: theme.backgroundSelected }}
              accessibilityRole="button"
              accessibilityLabel={`Add ${habit.name}`}
              style={({ pressed }) => [
                styles.addRow,
                index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
                pressed && styles.pressed,
              ]}>
              <MaterialIcons name="add-circle-outline" size={22} color={theme.accent} />
              <ThemedText type="default" style={styles.memberName} numberOfLines={1}>
                {habit.name}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {/* Delete (editing only) */}
      {stack ? (
        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          style={[styles.delete, { backgroundColor: theme.dangerSubtle }]}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            Delete stack
          </ThemedText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.two },
  fieldLabel: { letterSpacing: 0.5, marginTop: Spacing.three },
  input: {
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  hint: { marginTop: Spacing.one },
  group: {
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  ordinal: { width: 16, textAlign: 'center' },
  memberName: { flex: 1 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  pressed: { opacity: Pressed.dim },
  delete: {
    marginTop: Spacing.four,
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
