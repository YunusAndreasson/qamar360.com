import { ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { Spacing } from '@/constants/theme';
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
  paddingBottom: Spacing.five,
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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      {...props}>
      {/* Same lunar-sky backdrop every other screen carries, so the editors aren't the odd
          ones out. Absolutely fills the surface and is non-interactive, so it renders first. */}
      <GeometricBackdrop variant="screen" />
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: formContentStyle,
});
