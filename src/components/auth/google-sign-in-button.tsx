import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GoogleLogo } from '@/components/brand/google-logo';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { googleAuthAvailable } from '@/lib/social-auth';

/**
 * "Continue with Google" — a custom button (Apple ships its own; Google does not) that reuses
 * AppButton's geometry so it lines up pixel-for-pixel with the Apple button and the primary CTA.
 * Neutral "mission-control" surface (`backgroundElement` fill + hairline border) with Google's
 * required four-colour mark at left. Renders nothing when the native module / Web client id is
 * absent, so the caller can drop it in unconditionally.
 */
export function GoogleSignInButton({ onPress, busy }: { onPress: () => void; busy?: boolean }) {
  const theme = useTheme();
  if (!googleAuthAvailable) return null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      disabled={busy}
      android_ripple={{ color: theme.backgroundSelected }}
      style={[styles.button, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      onPress={onPress}>
      {busy ? (
        <ActivityIndicator color={theme.text} />
      ) : (
        <View style={styles.content}>
          <GoogleLogo size={20} />
          <ThemedText type="defaultSemiBold">Continue with Google</ThemedText>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Mirror AppButton: Radius.button (12), 48pt min height, same horizontal gutter.
  button: {
    borderRadius: Radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The mark sits just left of the label, together centred in the button.
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
