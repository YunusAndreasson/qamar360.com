import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'sign-in') {
        // On success, onAuthStateChange flips the root gate to (tabs).
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        // With email confirmation on, no session is returned yet.
        setNotice('Account created. If a session does not start, confirm your email, then sign in.');
        setMode('sign-in');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">qamar360</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {mode === 'sign-in' ? 'Sign in to continue' : 'Create an account'}
        </ThemedText>

        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
        />

        {error ? (
          <ThemedText type="small" style={styles.error}>
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
          style={[styles.button, { backgroundColor: theme.text, opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {mode === 'sign-in' ? 'Sign in' : 'Sign up'}
            </ThemedText>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setError(null);
            setNotice(null);
            setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'));
          }}
          style={styles.switchMode}>
          <ThemedText type="small" themeColor="textSecondary">
            {mode === 'sign-in' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  subtitle: { marginBottom: Spacing.two },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: { color: '#e5484d' },
  button: {
    marginTop: Spacing.two,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchMode: { alignItems: 'center', paddingVertical: Spacing.two },
});
