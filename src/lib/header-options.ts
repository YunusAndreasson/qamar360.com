import { Platform } from 'react-native';

/**
 * Native-Stack header options, themed per platform.
 *
 * iOS keeps the system's translucent (glass) large-title bar, which auto-adapts
 * to light/dark — so we set no background there. Android has no glass header and
 * react-navigation otherwise paints a light header even in dark mode, so we tint
 * it to match the app's theme. `headerShadowVisible: false` drops the hairline
 * separator on both.
 */
export function stackHeaderOptions(theme: { background: string; text: string }) {
  return {
    headerShadowVisible: false,
    // Theme the screen background so push/modal transitions never flash the
    // navigator's default (white) behind the app.
    contentStyle: { backgroundColor: theme.background },
    ...(Platform.OS === 'android'
      ? {
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text },
        }
      : null),
  };
}

/**
 * Native-Stack options for a modal sheet. iOS modals don't get the glass large-title
 * treatment, so their nav bar renders white in dark mode unless explicitly tinted — so we
 * theme it here. Shared by every modal route (the habit & stack editors).
 */
export function modalHeaderOptions(theme: { background: string; text: string }) {
  return {
    presentation: 'modal' as const,
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.text,
  };
}
