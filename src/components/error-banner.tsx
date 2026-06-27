import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** How long a transient error lingers before it auto-dismisses. */
const AUTO_DISMISS_MS = 4000;

type Props = {
  /** The error to show, or null/empty to render nothing. */
  message: string | null;
  /** Clear the error — called on tap and after {@link AUTO_DISMISS_MS}. */
  onDismiss: () => void;
  /** Extra layout (e.g. horizontal margin when not already inside a padded container). */
  style?: StyleProp<ViewStyle>;
};

/**
 * The app's one error surface: a tappable danger-tinted banner that also clears itself
 * after a few seconds so a transient failure never lingers. Used by the Habits and
 * Progress screens so they stay byte-for-byte identical.
 */
export function ErrorBanner({ message, onDismiss, style }: Props) {
  const theme = useTheme();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <PressableScale
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${message} Tap to dismiss.`}
      style={[styles.banner, { backgroundColor: theme.dangerSubtle, borderColor: theme.danger }, style]}>
      <ThemedText type="small" themeColor="danger">
        {message}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginBottom: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.banner,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
