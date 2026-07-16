import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  onCancel?: () => void;
  onSave: () => void;
  canSave: boolean;
  saveLabel?: string;
};

function headerCancelAction(onCancel?: () => void, label = 'Cancel') {
  if (!onCancel) return undefined;
  return function HeaderCancel() {
    return <HeaderCancelButton onCancel={onCancel} label={label} />;
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
export function headerCloseAction(onClose: () => void, label = 'Close') {
  return function HeaderClose() {
    return <HeaderCancelButton onCancel={onClose} label={label} />;
  };
}

export function formHeaderActions({ onCancel, onSave, canSave, saveLabel }: Props) {
  return {
    headerLeft: headerCancelAction(onCancel),
    headerRight: headerSaveAction(onSave, canSave, saveLabel),
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
