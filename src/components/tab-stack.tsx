import { Stack } from 'expo-router';
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
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <GeometricBackdrop variant="screen" />
      <Stack screenOptions={stackHeaderOptions(theme)}>{children}</Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
