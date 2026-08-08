import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { AuthBackdrop } from '@/components/auth/auth-backdrop';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { FormField } from '@/components/form-field';
import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { socialAuthAvailable } from '@/lib/social-auth';

import type { TextInput } from 'react-native';

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
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithApple, signInWithGoogle, resetPassword, verifyRecovery, updatePassword, signOut } =
    useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // also the new password in 'reset' mode
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<'apple' | 'google' | null>(null);
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
    // Always cleared: the same state backs the sign-in password AND the reset flow's "new
    // password", so a leftover (mistyped) sign-in password carried into 'forgot' → 'reset'
    // could silently become the account's new password.
    setPassword('');
    setMode(next);
  }

  async function handleSocial(provider: 'apple' | 'google') {
    // One auth flow at a time: Apple's native button carries no busy/disabled state, so without
    // this guard a second tap (or a tap during the email flow) starts an overlapping attempt
    // whose failure surfaces as a spurious mid-flow form error.
    if (busy || socialBusy) return;
    setError(null);
    setNotice(null);
    setSocialBusy(provider);
    try {
      if (provider === 'apple') await signInWithApple();
      else await signInWithGoogle();
      // On success, onAuthStateChange flips the root gate to (tabs). A cancel resolves as a
      // no-op (no error), so nothing is shown when the user backs out of the native sheet.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setSocialBusy(null);
    }
  }

  async function onSubmit() {
    if (busy || socialBusy) return; // one auth flow at a time (see handleSocial)
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
        setPassword(''); // the "New password" field must start empty (see goTo)
        setMode('reset');
      } else {
        // reset
        if (!code.trim() || !password) {
          setError('Enter the code and a new password.');
          return;
        }
        await verifyRecovery(email.trim(), code.trim());
        // Verifying the OTP created a session, which flips the root gate and unmounts this
        // screen — so a failure here can't surface through setError (it would land on an
        // unmounted form and the user would sail into the app believing the password changed,
        // with only the recovery session to their name). Alert survives the unmount; signing
        // out drops the half-recovered session back onto a fresh sign-in screen to retry.
        try {
          await updatePassword(password);
        } catch (e) {
          Alert.alert('Password not updated', e instanceof Error ? e.message : 'Please try again.');
          // Best-effort: if the sign-out itself fails (offline), the user stays signed in via
          // the recovery session — the Alert has already told them the password didn't change.
          await signOut().catch(() => undefined);
          return;
        }
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
  // Social sign-in leads the sign-in / sign-up screens; hidden during password recovery, and in
  // Expo Go (the native modules aren't bundled there).
  const showSocial = socialAuthAvailable && (mode === 'sign-in' || mode === 'sign-up');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* The night-street photo, dissolving into the ordinary theme.background toward the
          bottom — the auth screen's one full-bleed hero moment. */}
      <AuthBackdrop />

      {/* Pinned to the photo's clear sky, independent of the keyboard-avoiding form below so it
          never shifts when the keyboard opens. The real moon in the photo carries the brand's
          moon motif here — no illustrated mark layered on top of it. */}
      <View style={[styles.wordmark, { top: insets.top + Spacing.three }]} pointerEvents="none">
        <ThemedText type="subtitle" style={[styles.centeredText, styles.wordmarkText]}>
          {APP_NAME}
        </ThemedText>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
      <View style={[styles.safeArea, { paddingBottom: insets.bottom + Spacing.four }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          {SUBTITLES[mode]}
        </ThemedText>

        {showSocial ? (
          <View style={styles.social}>
            <AppleSignInButton onPress={() => handleSocial('apple')} />
            <GoogleSignInButton onPress={() => handleSocial('google')} busy={socialBusy === 'google'} />
            <View style={styles.divider}>
              <View style={[styles.rule, { backgroundColor: theme.border }]} />
              <ThemedText type="small" themeColor="textSecondary">
                or
              </ThemedText>
              <View style={[styles.rule, { backgroundColor: theme.border }]} />
            </View>
          </View>
        ) : null}

        {showEmail ? (
          <FormField
            placeholder="Email"
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
          <FormField
            placeholder="6-digit code"
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
          <FormField
            placeholder="Password"
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
          <FormField
            placeholder="New password"
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
          <ThemedText type="small" themeColor="danger" role="alert" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}
        {notice ? (
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
            {notice}
          </ThemedText>
        ) : null}

        <AppButton variant="primary" busy={busy} onPress={onSubmit} style={styles.submitButton}>
          {SUBMIT_LABELS[mode]}
        </AppButton>

        {mode === 'sign-in' ? (
          <>
            <AppButton variant="secondary" onPress={() => goTo('sign-up')}>
              Need an account? Sign up
            </AppButton>
            <AppButton variant="secondary" onPress={() => goTo('forgot')}>
              Forgot password?
            </AppButton>
          </>
        ) : (
          <AppButton variant="secondary" onPress={() => goTo('sign-in')}>
            {mode === 'sign-up' ? 'Have an account? Sign in' : 'Back to sign in'}
          </AppButton>
        )}
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  // Settle the form low, against the resolved-opaque foot of the backdrop's scrim — this is what
  // leaves the photo's middle (the walking figure, the moon) unobstructed above it. Still scrolls
  // (keyboard-safe) once content outgrows the screen.
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  safeArea: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  // Fixed to the top safe area, independent of the scrolling form — see the render-side comment.
  wordmark: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Sits directly on the raw photo (nothing else in this screen does), so it carries its own
  // fixed-white + shadow treatment rather than the themed text color.
  wordmarkText: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  centeredText: { textAlign: 'center' },
  social: { gap: Spacing.two },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.one },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  submitButton: {
    marginTop: Spacing.two,
  },
});
