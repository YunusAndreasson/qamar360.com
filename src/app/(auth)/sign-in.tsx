import { useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { AuthBackdrop } from '@/components/auth/auth-backdrop';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { FormField } from '@/components/form-field';
import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { MaxContentWidth, Pressed, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { googleAuthAvailable, socialAuthAvailable } from '@/lib/social-auth';

import type { ReactNode } from 'react';
import type { TextInputInstance } from 'react-native';

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

/**
 * The way in — and the app's first screen, so it is mostly photograph.
 *
 * It used to put everything it could do on one page: two social buttons, a rule, two fields, a
 * filled submit and two more full-width buttons under that. Nine controls stacked from the floor,
 * which left the hero image as a strip of sky above a wall of chrome — and made the two most
 * common ways in look no more likely than "Forgot password?".
 *
 * So the screen has one job at rest: Apple, Google, and a quiet line offering email. The email form
 * is a door rather than a wall — it opens in place of the social block (never above it, which would
 * rebuild the same stack), and everything rarer than "sign in" is small print beneath it. What that
 * buys is the photograph: the walking figure and the moon stay uncovered, which is the whole reason
 * the image is there.
 *
 * The one thing that must never happen is a screen with no way in, so the form opens by default
 * wherever the social buttons cannot render (see `anySocial`).
 */
export default function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithApple, signInWithGoogle, resetPassword, verifyRecovery, updatePassword, signOut } =
    useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  // Whether the email form has been asked for. Not a `Mode` of its own: 'sign-in' means the same
  // thing on both sides of this door, and folding the two together would need every label map
  // below to carry an entry that has no submit button.
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // also the new password in 'reset' mode
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Refs for keyboard "next" focus-chaining so the form is submittable without
  // reaching the button (which can sit behind the keyboard).
  const passwordRef = useRef<TextInputInstance>(null);
  const newPasswordRef = useRef<TextInputInstance>(null);

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

  /** Back to the landing: the social buttons, and the email door shut again. */
  function closeEmail() {
    goTo('sign-in');
    setEmailOpen(false);
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode !== 'forgot' && !password) {
      setError('Enter your password.');
      passwordRef.current?.focus();
      return;
    }
    if (mode === 'reset' && !/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'sign-in') {
        // On success, onAuthStateChange flips the root gate to (tabs).
        await signIn(email.trim(), password);
      } else if (mode === 'sign-up') {
        await signUp(email.trim(), password);
        // With email confirmation on, no session is returned yet.
        setNotice('Check your email to confirm your account, then sign in.');
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

  // Password recovery is an email flow by definition — there is no social door into it.
  const emailFlow = mode === 'forgot' || mode === 'reset';
  // Is there anything to lead with? `socialAuthAvailable` only says the native modules loaded;
  // whether a button actually draws is stricter — Google needs its web client id, and Apple is
  // iOS-only. Apple's real check is async (`appleAuthAvailable`), but it is effectively always true
  // on iOS 13+, so the platform stands in for it synchronously and there is no landing that flickers
  // between two layouts on the first frame. Being wrong here only starts the email door shut, one
  // tap from open — never a screen with no way in.
  const anySocial = socialAuthAvailable && (Platform.OS === 'ios' || googleAuthAvailable);
  const showForm = emailOpen || emailFlow || !anySocial;
  // The form takes the social block's place rather than sitting under it — stacked, the two would
  // rebuild exactly the wall this screen was rewritten to remove.
  const showSocial = anySocial && !showForm;
  const showEmailField = mode !== 'reset';
  const showPasswordField = mode === 'sign-in' || mode === 'sign-up';

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

      <View style={styles.flex}>
        <KeyboardAwareScrollView
          bottomOffset={24}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <View style={[styles.safeArea, { paddingBottom: insets.bottom + Spacing.four }]}>
            {/* Only over the form. On the landing the two buttons say what they do, and a line
                telling you to sign in above two sign-in buttons is a caption on a caption. */}
            {showForm ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
                {SUBTITLES[mode]}
              </ThemedText>
            ) : null}

            {/* Above the controls in both states: a social failure and a form failure are both
                about the attempt you just made, and this is where the eye already is. */}
            {error ? (
              <ThemedText type="small" themeColor="danger" role="alert" accessibilityLiveRegion="polite"
                style={styles.centeredText}>
                {error}
              </ThemedText>
            ) : null}
            {notice ? (
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite"
                style={styles.centeredText}>
                {notice}
              </ThemedText>
            ) : null}

            {showSocial ? (
              <View style={styles.social}>
                <AppleSignInButton onPress={() => handleSocial('apple')} />
                <GoogleSignInButton onPress={() => handleSocial('google')} busy={socialBusy === 'google'} />
              </View>
            ) : null}

            {showForm ? (
              <>
                {showEmailField ? (
                  <FormField
                    placeholder="Email"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    returnKeyType={showPasswordField ? 'next' : 'go'}
                    onSubmitEditing={() => {
                      if (showPasswordField) passwordRef.current?.focus();
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

                {showPasswordField ? (
                  <FormField
                    placeholder="Password"
                    autoCapitalize="none"
                    ref={passwordRef}
                    secureTextEntry
                    textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
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

                <AppButton variant="primary" busy={busy} onPress={onSubmit}>
                  {SUBMIT_LABELS[mode]}
                </AppButton>
              </>
            ) : null}

            {/* Everything rarer than "sign in", as small print. Two on one line where they pair —
                a second and third full-width button is what made three equal-looking verbs out of
                one likely one. */}
            <View style={styles.links}>
              {showForm ? (
                mode === 'sign-in' ? (
                  <View style={styles.linkRow}>
                    <TextLink onPress={() => goTo('sign-up')}>Create an account</TextLink>
                    <ThemedText type="small" themeColor="textDisabled">
                      ·
                    </ThemedText>
                    <TextLink onPress={() => goTo('forgot')}>Forgot password?</TextLink>
                  </View>
                ) : (
                  <TextLink onPress={() => goTo('sign-in')}>
                    {mode === 'sign-up' ? 'Have an account? Sign in' : 'Back to sign in'}
                  </TextLink>
                )
              ) : (
                <TextLink onPress={() => setEmailOpen(true)}>Continue with email</TextLink>
              )}

              {/* The way back out of the door, from wherever the email flow has gone. Absent when
                  there is nothing behind it — with no social buttons the form IS the screen. */}
              {showForm && anySocial ? <TextLink onPress={closeEmail}>Other ways to sign in</TextLink> : null}
            </View>
          </View>
        </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

/**
 * The screen's small print: a text affordance rather than a button, so the things you rarely want
 * stop competing with the two you usually do. RN `Pressable` (not gesture-handler's `Touchable`,
 * which has form on small rows swallowing their own release) and a 44pt box under a `small` label,
 * so quiet to the eye is still full-size to a thumb.
 */
function TextLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.link, pressed && { opacity: Pressed.dim }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
        {children}
      </ThemedText>
    </Pressable>
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
  // No gap at all — tighter than the block gap above, because the small print is one group and
  // not more sections. (Each `TextLink` carries its own 44pt box, so the rows still don't touch.)
  links: { alignItems: 'center' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: Spacing.two },
  link: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.two },
});
