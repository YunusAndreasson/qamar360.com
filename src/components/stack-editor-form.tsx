import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Props = {
  /** All of the user's habits — the pool of selectable members. */
  habits: Habit[];
  /** A seed member for the new routine (e.g. the habit you started it from), or empty. */
  initialMemberIds: string[];
  /** Folded names of the user's existing routines — used to reject a duplicate. */
  existingNames: string[];
  onClose: () => void;
  onCreate: (name: string, orderedMemberIds: string[]) => void;
};

/**
 * The create-a-routine form. A native modal route (`habits/stack-editor`); Cancel/Save live in the
 * native nav bar. Pick member habits (the add order is the sequence — reorder later by dragging on
 * Today) and name the routine. A routine only groups habits visually — completion stays per-habit.
 * Renaming and deleting an existing routine live in the manage sheet (`habits/stack-manage`), and
 * its members are added/removed/reordered by dragging the card — so none of that is edited here.
 */
export function StackEditorForm({ habits, initialMemberIds, existingNames, onClose, onCreate }: Props) {
  const theme = useTheme();

  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>(initialMemberIds);

  const byId = useMemo(() => new Map(habits.map((h) => [h.id, h])), [habits]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Selectable additions: standalone habits not already selected (and not a pending temp row).
  const available = useMemo(
    () => habits.filter((h) => h.stack_id == null && !selectedSet.has(h.id) && !h.id.startsWith('temp-')),
    [habits, selectedSet],
  );

  const trimmedName = name.trim();
  const isDuplicate = useMemo(
    () => trimmedName.length > 0 && existingNames.includes(trimmedName.toLowerCase()),
    [trimmedName, existingNames],
  );
  // A routine needs a name and at least two habits to be a meaningful sequence.
  const canSave = trimmedName.length > 0 && !isDuplicate && selected.length >= 2;

  const add = (id: string) => {
    haptics.selection();
    setSelected((prev) => [...prev, id]);
  };
  const remove = (id: string) => {
    haptics.selection();
    setSelected((prev) => prev.filter((x) => x !== id));
  };

  const save = () => {
    if (!canSave) return;
    onCreate(trimmedName, selected);
    onClose();
  };

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: 'New Routine',
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: onClose, onSave: save, canSave }),
        }}
      />

      {/* Name */}
      <FormField
        label="NAME"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Morning routine"
        autoCapitalize="sentences"
        autoFocus
        accessibilityLabel="Routine name"
        error={isDuplicate ? 'You already have a routine with this name.' : undefined}
      />

      {/* Sequence — the ordered members */}
      <FieldLabel style={styles.fieldLabel}>SEQUENCE</FieldLabel>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        Put these in the order you will do them, starting from one real moment in your day.
      </ThemedText>
      {selected.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Add habits below to build the sequence.
        </ThemedText>
      ) : (
        <Surface compact>
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
                <ThemedText type="rowTitle" style={styles.memberName} numberOfLines={1}>
                  {habit.name}
                </ThemedText>
                {/* The × carries its own ≥44pt frame (the old 20pt glyph + hitSlop 11 resolved to
                    ~42pt, under the minimum — and slop can't overlap a neighbour). Reordering lives
                    on Today: press-and-drag a member within its card, the same as everywhere else —
                    so this form only picks the members; the sequence is the add order. */}
                <Pressable
                  onPress={() => remove(id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${habit.name}`}
                  style={styles.iconButton}>
                  <AppIcon name="close" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
            );
          })}
        </Surface>
      )}
      {selected.length === 1 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Add one more habit — a routine groups at least two.
        </ThemedText>
      ) : null}

      {/* Available habits to add */}
      <FieldLabel style={styles.fieldLabel}>ADD A HABIT</FieldLabel>
      {available.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {habits.length === 0 ? 'Add some habits first.' : 'No more standalone habits to add.'}
        </ThemedText>
      ) : (
        <Surface compact>
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
              <AppIcon name="addCircle" size={22} color={theme.accent} />
              <ThemedText type="rowTitle" style={styles.memberName} numberOfLines={1}>
                {habit.name}
              </ThemedText>
            </Pressable>
          ))}
        </Surface>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { marginTop: Spacing.three },
  hint: { marginTop: Spacing.one },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  ordinal: { width: 16, textAlign: 'center' },
  memberName: { flex: 1 },
  // A full-size (≥44pt) target for each row control, centring its 20pt glyph.
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  pressed: { opacity: Pressed.dim },
});
