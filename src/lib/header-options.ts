import { Platform } from 'react-native';

import { Face } from '@/constants/theme';

/**
 * Options for a tab's root screen so the stack's fixed sky (painted by `TabStack`) shows
 * through it: a transparent content background. The screen's scroll view must also be
 * transparent (AppScreen `transparent`, or a transparent list) — and stays the screen's first
 * descendant, so the native large title still collapses on scroll.
 */
export const transparentScreen = {
  contentStyle: { backgroundColor: 'transparent' },
  // Android's compact header is otherwise tinted opaque (stackHeaderOptions), capping the
  // fixed sky with a hard seam right where the overhead glow is richest; a sky-backed root
  // lets the sky continue behind the bar instead — the parity of iOS's at-rest transparent
  // large-title bar. On Android the header stays in-flow (NOT headerTransparent), so content
  // still starts below the bar and no manual insets appear. Scoped here — not in
  // stackHeaderOptions — so pushed opaque screens keep their themed bar seam-free.
  ...(Platform.OS === 'android' ? { headerStyle: { backgroundColor: 'transparent' } } : null),
};

/**
 * Native-Stack header options, themed per platform.
 *
 * iOS keeps the system's translucent (glass) large-title bar, which auto-adapts
 * to light/dark — so we set no background there. Leaving it unset is also what lets
 * expo-router (SDK 58+) float the bar over the content on iOS 26+ (Liquid Glass): the
 * screen runs up under it, and each root scroll view's `contentInsetAdjustmentBehavior=
 * "automatic"` keeps the first row clear of it. A screen whose content slides under the bar
 * pins `headerTransparent: false` for itself. Android has no glass header and
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
    // Screen titles join the app face — compact and large at the native default sizes
    // (17 semibold / 34 bold), so the bars read native, just in Inter. The back-button
    // label is deliberately left alone: styling `headerBackTitleStyle` disables iOS's
    // space-aware back title.
    headerTitleStyle: { fontFamily: Face.displaySemiBold, fontSize: 17, color: theme.text },
    headerLargeTitleStyle: { fontFamily: Face.displayBold, fontSize: 34 },
    ...(Platform.OS === 'android'
      ? {
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
        }
      : null),
  };
}

/**
 * Native-Stack options for a modal sheet. iOS modals don't get the glass large-title
 * treatment, so their nav bar renders white in dark mode unless explicitly tinted — so we
 * theme it here. Shared by every modal route (the habit editor, stack rename).
 */
export function modalHeaderOptions(theme: { background: string; text: string }) {
  return {
    presentation: 'modal' as const,
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.text,
    // Same title voice as stackHeaderOptions' compact bar.
    headerTitleStyle: { fontFamily: Face.displaySemiBold, fontSize: 17, color: theme.text },
  };
}

/**
 * Native-Stack options for a bottom sheet sized to its content — the compact sheet-of-rows
 * idiom (add-to-stack, stack-manage, the habit-stacking guide). No nav bar: the sheet carries
 * its own title; the grabber or a swipe-down dismisses it.
 */
export function formSheetOptions(theme: { background: string }) {
  return {
    presentation: 'formSheet' as const,
    headerShown: false,
    sheetAllowedDetents: 'fitToContents' as const,
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
    contentStyle: { backgroundColor: theme.background },
  };
}
