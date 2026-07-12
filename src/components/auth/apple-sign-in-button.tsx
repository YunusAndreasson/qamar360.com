import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Radius } from '@/constants/theme';
import { useEffectiveScheme } from '@/hooks/use-theme';
import { AppleAuth, appleAuthAvailable } from '@/lib/social-auth';

/**
 * "Continue with Apple" — Apple's own `AppleAuthenticationButton`, which is the App Store-safe way
 * to render the mark (we tune only `cornerRadius`/`buttonStyle`/`buttonType`, never the glyph). Black
 * in light mode, white in dark, to sit correctly on the page. Renders nothing on Android, in Expo Go,
 * or on a device without Sign in with Apple — so the caller can drop it in unconditionally.
 */
export function AppleSignInButton({ onPress }: { onPress: () => void }) {
  const scheme = useEffectiveScheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    void appleAuthAvailable().then((ok) => {
      if (mounted) setAvailable(ok);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!AppleAuth || !available) return null;

  const { AppleAuthenticationButton, AppleAuthenticationButtonType, AppleAuthenticationButtonStyle } = AppleAuth;

  return (
    <AppleAuthenticationButton
      buttonType={AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={
        scheme === 'dark' ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={Radius.button}
      style={styles.button}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  // Match AppButton's 48pt height; the Apple button fills the column width.
  button: { width: '100%', height: 48 },
});
