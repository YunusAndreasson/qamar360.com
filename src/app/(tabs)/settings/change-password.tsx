import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

const MIN_LENGTH = 6;

/**
 * Set a new password while signed in — reuses `updatePassword()` (Supabase `updateUser`), which
 * acts on the live session, so there's no email-code round-trip like the forgot-password flow.
 * Save lives in the native nav bar (same idiom as `habit-editor.tsx`).
 */
export default function ChangePasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = password === confirm;
  const canSave = longEnough && matches && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await updatePassword(password);
      Alert.alert('Password updated', 'Your password has been changed.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      setBusy(false);
      Alert.alert('Could not update password', 'Please check your connection and try again.');
    }
  };

  const showLengthError = password.length > 0 && !longEnough;
  const showMatchError = confirm.length > 0 && !matches;
  const hint = showLengthError
    ? `Use at least ${MIN_LENGTH} characters.`
    : showMatchError
      ? 'Passwords don’t match.'
      : `At least ${MIN_LENGTH} characters.`;

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: 'Change password',
          headerTitleAlign: 'center',
          headerRight: () => (
            <Pressable onPress={() => void save()} disabled={!canSave} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="smallBold" style={{ color: canSave ? theme.accent : theme.textSecondary }}>
                Save
              </ThemedText>
            </Pressable>
          ),
        }}
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        NEW PASSWORD
      </ThemedText>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        autoFocus
        style={inputStyle}
        accessibilityLabel="New password"
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        CONFIRM PASSWORD
      </ThemedText>
      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirm password"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => void save()}
        style={inputStyle}
        accessibilityLabel="Confirm password"
      />

      <ThemedText
        type="small"
        style={[styles.hint, { color: showLengthError || showMatchError ? theme.danger : theme.textSecondary }]}>
        {hint}
      </ThemedText>
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
  hint: { marginTop: Spacing.one },
});
