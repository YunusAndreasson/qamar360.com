import { StyleSheet, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The one content gutter shared by every editor/auth form — a touch wider than the tab
 * screens (`AppScreen`, `Spacing.three`) so a modal form reads as its own surface, with a
 * tight field rhythm. Exported so the few form screens that build on `AppScreen` (e.g.
 * change-password) hang off the *same* values rather than re-declaring them.
 */
export const formContentStyle = {
  paddingHorizontal: Spacing.four,
  paddingTop: Spacing.three,
  // Clears the tab bar, which overlays these forms (they push inside a tab's stack rather than
  // presenting over it) — the same `BottomTabInset + gap` rule `AppScreen` uses. A plain
  // Spacing.five left the last field scrollable only to *behind* the bar: reachable content
  // that can never be brought fully into view, which is how the moment picker's last group
  // and its hint line went missing.
  paddingBottom: BottomTabInset + Spacing.five,
  gap: Spacing.two,
} as const;

/**
 * The shared scaffold for the app's modal editor forms (habit & stack editors): a themed,
 * keyboard-friendly scroll surface carrying the same lunar-sky backdrop as every other
 * screen, padded with {@link formContentStyle}. Extracted so the two editors stay
 * pixel-identical instead of each re-declaring the container, backdrop and gutter.
 */
export function FormScreen({ children, style, contentContainerStyle, ...props }: ScrollViewProps) {
  const theme = useTheme();
  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      keyboardDismissMode="on-drag"
      style={[styles.container, { backgroundColor: theme.background }, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      {...props}>
      {/* Same lunar-sky backdrop every other screen carries, so the editors aren't the odd
          ones out. Absolutely fills the surface and is non-interactive, so it renders first. */}
      <GeometricBackdrop variant="screen" />
      {children}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: formContentStyle,
});
