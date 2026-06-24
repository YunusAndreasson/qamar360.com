import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'reset';

const SUBTITLES: Record<Mode, string> = {
  'sign-in': 'Sign in to continue',
  'sign-up': 'Create an account',
  forgot: 'Reset your password',
  reset: 'Enter the code we emailed you',
};

const SUBMIT_LABELS: Record<Mode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Sign up',
  forgot: 'Send reset code',
  reset: 'Update password',
};

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn, signUp, resetPassword, verifyRecovery, updatePassword } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // also the new password in 'reset' mode
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Refs for keyboard "next" focus-chaining so the form is submittable without
  // reaching the button (which can sit behind the keyboard).
  const passwordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);

  function goTo(next: Mode) {
    setError(null);
    setNotice(null);
    setCode('');
    if (next === 'sign-in' || next === 'sign-up') setPassword('');
    setMode(next);
  }

  async function onSubmit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'sign-in') {
        // On success, onAuthStateChange flips the root gate to (tabs).
        await signIn(email.trim(), password);
      } else if (mode === 'sign-up') {
        await signUp(email.trim(), password);
        // With email confirmation on, no session is returned yet.
        setNotice('Account created. If a session does not start, confirm your email, then sign in.');
        setPassword('');
        setMode('sign-in');
      } else if (mode === 'forgot') {
        await resetPassword(email.trim());
        setNotice('We emailed you a 6-digit code. Enter it below with your new password.');
        setMode('reset');
      } else {
        // reset
        if (!code.trim() || !password) {
          setError('Enter the code and a new password.');
          return;
        }
        await verifyRecovery(email.trim(), code.trim());
        await updatePassword(password);
        setNotice('Password updated. Sign in with your new password.');
        setCode('');
        setPassword('');
        setMode('sign-in');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const showEmail = mode !== 'reset';
  const showPassword = mode === 'sign-in' || mode === 'sign-up';

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.brand}>
          <MaterialIcons name="dark-mode" size={40} color={theme.accent} />
          <ThemedText type="subtitle">qamar360</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {SUBTITLES[mode]}
        </ThemedText>

        {showEmail ? (
          <TextInput
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType={showPassword ? 'next' : 'go'}
            onSubmitEditing={() => {
              if (showPassword) passwordRef.current?.focus();
              else void onSubmit();
            }}
            value={email}
            onChangeText={setEmail}
          />
        ) : null}

        {mode === 'reset' ? (
          <TextInput
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
            placeholder="6-digit code"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            returnKeyType="next"
            onSubmitEditing={() => newPasswordRef.current?.focus()}
            value={code}
            onChangeText={setCode}
          />
        ) : null}

        {showPassword ? (
          <TextInput
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            ref={passwordRef}
            secureTextEntry
            textContentType="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'password'}
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
            value={password}
            onChangeText={setPassword}
          />
        ) : null}

        {mode === 'reset' ? (
          <TextInput
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
            placeholder="New password"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            ref={newPasswordRef}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
            value={password}
            onChangeText={setPassword}
          />
        ) : null}

        {error ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {error}
          </ThemedText>
        ) : null}
        {notice ? (
          <ThemedText type="small" themeColor="textSecondary">
            {notice}
          </ThemedText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onSubmit}
          style={[styles.button, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator color={theme.accentText} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.accentText }}>
              {SUBMIT_LABELS[mode]}
            </ThemedText>
          )}
        </Pressable>

        {mode === 'sign-in' ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => goTo('sign-up')} style={styles.switchMode}>
              <ThemedText type="small" themeColor="textSecondary">
                Need an account? Sign up
              </ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => goTo('forgot')} style={styles.switchMode}>
              <ThemedText type="small" themeColor="textSecondary">
                Forgot password?
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => goTo('sign-in')} style={styles.switchMode}>
            <ThemedText type="small" themeColor="textSecondary">
              {mode === 'sign-up' ? 'Have an account? Sign in' : 'Back to sign in'}
            </ThemedText>
          </Pressable>
        )}
      </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  brand: { gap: Spacing.one },
  subtitle: { marginBottom: Spacing.two },
  input: {
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  button: {
    marginTop: Spacing.two,
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchMode: { alignItems: 'center', paddingVertical: Spacing.one },
});
