import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  onCancel?: () => void;
  onSave: () => void;
  canSave: boolean;
  saveLabel?: string;
  cancelLabel?: string;
};

export function headerCancelAction(onCancel?: () => void, label = 'Cancel') {
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

export function formHeaderActions({ onCancel, onSave, canSave, saveLabel, cancelLabel }: Props) {
  return {
    headerLeft: headerCancelAction(onCancel, cancelLabel),
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
