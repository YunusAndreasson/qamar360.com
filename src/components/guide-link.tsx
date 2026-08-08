import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Href } from 'expo-router';

/**
 * A quiet way out of a from-scratch form to the guide behind it.
 *
 * The libraries carry their guide inline at the head of the page, but both "your own …" forms can
 * be reached without passing a library — Today's first-run empty state opens `stack-new` directly.
 * So the reasoning stays one tap away from the blank field too, in the smallest form that can
 * still be found: a muted line at the foot of the form, below every control, where it cannot
 * compete with the thing you came to fill in.
 *
 * Pushes rather than presenting: these forms are already modals, and the guide is a longer read
 * that wants a back button and a title of its own.
 */
export function GuideLink({ label, href }: { label: string; href: Href }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(href)}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens the guide."
      style={({ pressed }) => [styles.link, pressed && { opacity: Pressed.dim }]}>
      <AppIcon name="help" size={16} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A real 44pt target, set off from the last field by the form's own gap plus a little more.
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    marginTop: Spacing.three,
  },
});
