import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, type TextInput } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { FormField } from '@/components/form-field';
import { headerSaveAction } from '@/components/form-header-actions';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

const MIN_LENGTH = 6;

/**
 * Set a new password while signed in — reuses `updatePassword()` (Supabase `updateUser`), which
 * acts on the live session, so there's no email-code round-trip like the forgot-password flow.
 * Save lives in the native nav bar (same idiom as `habit-editor.tsx`).
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<TextInput>(null);

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

  return (
    <AppScreen
      contentStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      bottomInset={false}>
      <Stack.Screen
        options={{
          title: 'Change Password',
          headerRight: headerSaveAction(() => void save(), canSave),
        }}
      />

      <FormField
        label="NEW PASSWORD"
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        autoFocus
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        accessibilityLabel="New password"
      />

      <FormField
        ref={confirmRef}
        label="CONFIRM PASSWORD"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirm password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void save()}
        accessibilityLabel="Confirm password"
        hint={!showLengthError && !showMatchError ? hint : undefined}
        error={showLengthError || showMatchError ? hint : undefined}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
});
