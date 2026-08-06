import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Open with the keyboard up (the "+" menu's Task choice, or a long press on a row). */
  open: boolean;
  /** What is in the field. Owned by the section, so switching to an edit is one plain event. */
  value: string;
  onChangeText: (text: string) => void;
  onOpen: () => void;
  /** Commit. Called with a trimmed, non-empty title; the field stays open for the next one. */
  onSubmit: (title: string) => void;
  /** The field closed (blur, or an edit abandoned). */
  onClose: () => void;
  /** Present only while rewriting an existing task — the trailing bin. Absent on a new one. */
  onDelete?: () => void;
};

/**
 * Writing a task down — the whole of it, inline, in the card it lands in.
 *
 * Capture is the one thing a list of one-off things has to be fast at, so there is no modal and no
 * form: the row you tap becomes the field you type in, Return commits and **keeps the keyboard up**
 * for the next one (`submitBehavior="submit"`), and blurring puts the row back. A one-line title is
 * all a task is — no notes, no date, nothing to fill in — so a screen asking for those would be
 * asking for work the thing itself doesn't have.
 *
 * Its leading slot holds the same 32-wide column the rows use, so the field lines up with the
 * titles above it and the list doesn't step sideways as it grows.
 */
export function TaskComposer({ open, value, onChangeText, onOpen, onSubmit, onClose, onDelete }: Props) {
  const theme = useTheme();

  if (!open) {
    return (
      <Touchable
        onPress={onOpen}
        androidRipple={{ color: theme.backgroundSelected }}
        underlayColor={theme.backgroundSelected}
        activeUnderlayOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Add a task"
        accessibilityHint="Opens a field to write one down."
        style={styles.row}>
        <View style={styles.leading}>
          <AppIcon name="add" size={20} color={theme.accent} />
        </View>
        <ThemedText type="rowTitle" style={[styles.text, { color: theme.textSecondary }]}>
          Add a task
        </ThemedText>
      </Touchable>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.leading}>
        {/* A hollow ring in waiting — the mark this line is about to become. */}
        <View style={[styles.pending, { borderColor: theme.controlTrack }]} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit(value)}
        // Return commits and leaves the field open for the next one — the rhythm the whole
        // section is for. (RN 0.86: `submitBehavior`, not the removed `blurOnSubmit`.)
        submitBehavior="submit"
        // Whatever is in the field when focus leaves is kept, not thrown away — a keyboard
        // dismissed mid-thought must not eat the thought.
        onBlur={onClose}
        autoFocus
        autoCapitalize="sentences"
        returnKeyType="done"
        placeholder="Something to do once"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Task"
        style={[styles.text, styles.input, { color: theme.text }]}
      />
      {/* Deleting lives here, in the state where you are already changing the thing — so a task
          carries no trailing "⋯" of its own at rest, and nothing has to be discovered by swiping.
          `onPressIn`, deliberately: the field's own blur closes this row, and a press that waited
          for the release would be cancelled out from under the finger. It only raises a confirm,
          so an accidental touch costs one "Cancel". */}
      {onDelete ? (
        <Pressable
          onPressIn={onDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Delete this task"
          style={styles.delete}>
          <AppIcon name="delete" size={20} color={theme.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The row geometry of a task, so the field sits exactly where its row will.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  leading: { width: 32, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, marginLeft: Spacing.three },
  // The field wears the row's type, not the form input's — this is a line in a list, and a boxed
  // 18pt input would announce itself as a form the section doesn't have.
  // Deliberately no `lineHeight`: on iOS an explicit one clips the glyph box (see FormField).
  input: { fontSize: Typography.rowTitle.fontSize, padding: 0 },
  pending: { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  delete: { paddingLeft: Spacing.three, alignItems: 'center', justifyContent: 'center' },
});
