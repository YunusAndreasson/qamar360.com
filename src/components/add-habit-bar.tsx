import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  onAdd: (name: string) => void;
};

/**
 * Inline "Add a habit…" row (Apple Reminders / Todoist style). Submitting on the
 * return key adds the habit and clears the field while keeping focus, so several
 * habits can be added in quick succession.
 */
export function AddHabitBar({ onAdd }: Props) {
  const theme = useTheme();
  const [text, setText] = useState('');

  const submit = () => {
    const name = text.trim();
    if (!name) return;
    onAdd(name);
    setText('');
  };

  return (
    <View style={styles.row}>
      <MaterialIcons name="add" size={28} color={theme.textSecondary} />
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        placeholder="Add a habit…"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="done"
        submitBehavior="submit" // keep focus after submitting for rapid entry
        autoCapitalize="sentences"
        style={[styles.input, { color: theme.text }]}
        accessibilityLabel="Add a habit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: Spacing.one,
  },
});
