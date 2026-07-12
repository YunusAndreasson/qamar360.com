/**
 * Native social sign-in (Apple + Google) via Supabase ID-token exchange.
 *
 * Both are native modules that are NOT in Expo Go (SDK 53+), and an OTA update can't add
 * native code to an existing binary. So we load them defensively — never in Expo Go (the
 * import throws there) — exactly like {@link ./notifications}. `socialAuthAvailable` reflects
 * whether they actually loaded, and the sign-in screen hides the social buttons when they
 * didn't, so the buttons light up only in a build that bundled the native modules.
 *
 * The landed session flows through `supabase.auth.onAuthStateChange` (see use-auth), so callers
 * don't navigate — the root gate flips on its own. User-cancellation resolves as a no-op.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// The modules' *types* without a runtime import — a static `import` would evaluate the native
// module and crash Expo Go (the native side is absent there).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type AppleModule = typeof import('expo-apple-authentication');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type GoogleModule = typeof import('@react-native-google-signin/google-signin');

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function loadApple(): AppleModule | null {
  // Apple Sign In is iOS-only; and Expo Go ships no native module for it.
  if (inExpoGo || Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-apple-authentication') as AppleModule;
  } catch {
    return null; // a build that predates the dependency
  }
}

function loadGoogle(): GoogleModule | null {
  if (inExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    return null;
  }
}

/** The Apple module handle (or null in Expo Go / on Android). Exported so the Apple button can
 * render Apple's own `AppleAuthenticationButton` without a static native import. */
export const AppleAuth = loadApple();
const Google = loadGoogle();

/** True only in a dev/release build that bundled either native module (never Expo Go). */
export const socialAuthAvailable = AppleAuth !== null || Google !== null;

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/** Whether the Google button should render — the native module is present and a Web client id is set. */
export const googleAuthAvailable = Google !== null && !!GOOGLE_WEB_CLIENT_ID;

/**
 * Whether the Apple button should render: iOS, the native module present, AND the device supports
 * Sign in with Apple (iOS 13+ with an Apple ID). Async because it hits the native availability check.
 */
export async function appleAuthAvailable(): Promise<boolean> {
  if (!AppleAuth) return false;
  try {
    return await AppleAuth.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple via the native sheet, exchanging the identity token with Supabase.
 * Resolves as a no-op if the user cancels; throws on any real failure.
 */
export async function signInWithApple(): Promise<void> {
  if (!AppleAuth) throw new Error('Apple sign-in needs a development build.');
  let credential;
  try {
    credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return; // user backed out
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
  // `handle_new_user` provisions public.users on first sign-in; the session lands via onAuthStateChange.
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

let googleConfigured = false;

/**
 * Sign in with Google via the native account picker, exchanging the ID token with Supabase.
 * Resolves as a no-op if the user cancels; throws on any real failure.
 */
export async function signInWithGoogle(): Promise<void> {
  if (!Google) throw new Error('Google sign-in needs a development build.');
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.');
  const { GoogleSignin, statusCodes, isSuccessResponse, isErrorWithCode } = Google;

  if (!googleConfigured) {
    // webClientId is what Supabase verifies the token against; iosClientId lets the native
    // iOS flow mint a token for our own OAuth client.
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
    googleConfigured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return; // cancelled
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google did not return an ID token.');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw error;
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) {
      return; // user dismissed the picker, or a sign-in is already in flight
    }
    throw e;
  }
}
