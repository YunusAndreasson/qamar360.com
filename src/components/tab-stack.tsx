import { Stack, ThemeProvider, useTheme as useNavigationTheme } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { useTheme } from '@/hooks/use-theme';
import { stackHeaderOptions } from '@/lib/header-options';

import type { ReactNode } from 'react';

/**
 * Shared chrome for a bottom-tab's native Stack: a fixed lunar sky painted *behind the whole
 * stack*, with the stack laid over it. Each tab uses this so all three read identically.
 *
 * The sky must live here (behind the stack), not as a sibling inside a screen: react-native-
 * screens finds the scrollable that drives the large-title collapse by walking the screen's
 * *first-descendant chain* (`subviews[0]`), so the screen's scroll view has to be its first
 * child. A tab's root screen therefore renders transparently over this sky — `transparentScreen`
 * for its `contentStyle`, and a transparent scroll view (AppScreen `transparent`, or a
 * transparent list) — so the fixed sky shows through and stays put while content scrolls, while
 * the scroll view stays the screen's first descendant and the title keeps collapsing.
 *
 * Pass the stack's `<Stack.Screen>`s as children.
 */
export function TabStack({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const navigation = useNavigationTheme();
  // The sky's one hard requirement: nothing opaque may sit between it and the screen. From
  // expo-router 57.0.9 the native stack paints its *container* — the UINavigationController's
  // own view, above this sky and below the (transparent) screen — with the navigation theme's
  // `background` (`ScreenStack`'s `nativeContainerStyle`, landing on
  // `_controller.view.backgroundColor`). Ours is the opaque app background, so the stack
  // sealed the sky off: the stars and the corner bloom vanished on all three tabs while every
  // screen that paints its own in-tree backdrop (the editors, Discover, sign-in) kept theirs.
  // Before that release the prop didn't exist and the container was simply left alone, so a
  // clear colour here restores exactly the layering this whole component is built on.
  //
  // Scoped to the tab stacks rather than the root theme: only these three lean on a sky
  // *behind* the navigator. And it can't leak into the screens themselves — a screen's own
  // `contentStyle` is applied after this default, and `stackHeaderOptions` gives every screen
  // in the stack an explicit one (opaque, or transparent via `transparentScreen`).
  const skyBacked = { ...navigation, colors: { ...navigation.colors, background: 'transparent' } };
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <GeometricBackdrop variant="screen" />
      <ThemeProvider value={skyBacked}>
        <Stack screenOptions={stackHeaderOptions(theme)}>{children}</Stack>
      </ThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
