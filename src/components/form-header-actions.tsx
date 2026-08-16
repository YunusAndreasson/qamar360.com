import { Pressable, StyleSheet } from 'react-native';

import { HeaderActions } from '@/components/header-icon-button';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

type Props = {
  onCancel?: () => void;
  onSave: () => void;
  canSave: boolean;
  saveLabel?: string;
  /**
   * A glyph to sit before Save — the note editor's `⋯`, and whatever wants one next.
   *
   * Passed in rather than composed at the call site so that a form with an extra action still gets
   * its Save from here: two modals building the same button two ways is how the one word every
   * form ends on starts rendering differently in each of them.
   */
  extra?: ReactNode;
};

function headerCancelAction(onCancel?: () => void) {
  if (!onCancel) return undefined;
  return function HeaderCancel() {
    return <HeaderCancelButton onCancel={onCancel} label="Cancel" />;
  };
}

export function headerSaveAction(onSave: () => void, canSave: boolean, label = 'Save') {
  return function HeaderSave() {
    return <HeaderSaveButton onSave={onSave} canSave={canSave} label={label} />;
  };
}

/**
 * A plain dismiss button for a modal that has nothing to save — e.g. the Discover sheet, where
 * adds commit instantly. Left-aligned like every other modal's dismiss (the editors' "Cancel"),
 * so the app's sheets all close from the same place.
 */
export function headerCloseAction(onClose: () => void) {
  return function HeaderClose() {
    return <HeaderCancelButton onCancel={onClose} label="Close" />;
  };
}

export function formHeaderActions({ onCancel, onSave, canSave, saveLabel, extra }: Props) {
  const Save = headerSaveAction(onSave, canSave, saveLabel);
  return {
    headerLeft: headerCancelAction(onCancel),
    // Without an extra glyph the output is exactly what it always was — a bare Save, no wrapper —
    // so every form that doesn't ask for one is untouched.
    headerRight: extra
      ? function HeaderRight() {
          return (
            <HeaderActions>
              {extra}
              <Save />
            </HeaderActions>
          );
        }
      : Save,
  };
}

const styles = StyleSheet.create({
  action: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.half },
  pressed: { opacity: Pressed.dim },
});

function HeaderCancelButton({ onCancel, label }: { onCancel: () => void; label: string }) {
  return (
    <Pressable
      onPress={onCancel}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

function HeaderSaveButton({ onSave, canSave, label }: { onSave: () => void; canSave: boolean; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onSave}
      disabled={!canSave}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canSave }}
      hitSlop={8}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <ThemedText type="smallBold" style={{ color: canSave ? theme.accent : theme.textDisabled }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
