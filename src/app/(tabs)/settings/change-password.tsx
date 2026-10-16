import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, type TextInputInstance } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { FormField } from '@/components/form-field';
import { headerSaveAction } from '@/components/form-header-actions';
import { formContentStyle } from '@/components/form-screen';
import { useToast } from '@/components/toast';
import { useAuth } from '@/hooks/use-auth';

const MIN_LENGTH = 6;

/**
 * Set a new password while signed in — reuses `updatePassword()` (Supabase `updateUser`), which
 * acts on the live session, so there's no email-code round-trip like the forgot-password flow.
 * Save lives in the native nav bar (same idiom as `habit-editor.tsx`).
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<TextInputInstance>(null);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = password === confirm;
  const canSave = longEnough && matches && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await updatePassword(password);
      // Navigate at once and confirm with a quiet toast (the app's success voice — see the
      // Settings reset). The old success *Alert* stranded Android users: its dialog can be
      // dismissed by back/outside-tap without firing any button, leaving a changed password
      // behind a still-`busy`, permanently dead Save.
      router.back();
      toast.show('Password updated', 'success');
    } catch (e) {
      setBusy(false);
      // Surface Supabase's own reason when it gives one ("New password should be different
      // from the old password." is actionable; "check your connection" for that is a lie).
      const message = e instanceof Error && e.message ? e.message : 'Please check your connection and try again.';
      Alert.alert('Could not update password', message);
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
      contentStyle={formContentStyle}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      bottomInset={false}>
      {/* Title comes from the settings layout registration; only the live Save action is local. */}
      <Stack.Screen options={{ headerRight: headerSaveAction(() => void save(), canSave) }} />

      <FormField
        label="NEW PASSWORD"
        value={password}
        onChangeText={setPassword}
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
