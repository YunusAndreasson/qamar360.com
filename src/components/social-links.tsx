import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { InstagramLogo } from '@/components/brand/instagram-logo';
import { XLogo } from '@/components/brand/x-logo';
import { PressableScale } from '@/components/pressable-scale';
import { Links } from '@/constants/links';
import { Scale } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

/** Point size of each glyph; the tap target is padded out to 44pt around it. */
const GLYPH = 22;

/**
 * The product's online presence — website + socials — as one compact row of monochrome icon
 * buttons: the modern settings-footer idiom, where a labelled list row per network would be heavy.
 * URLs come from {@link Links} (one source of truth) and open in the in-app browser. The brand marks
 * (Instagram, X) are dedicated SVGs tinted to the muted footer colour, so they sit in the app's
 * near-greyscale palette instead of shouting their brand hues.
 */
export function SocialLinks({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const tint = theme.textSecondary;

  return (
    <View style={[styles.row, style]} accessibilityRole="list">
      <LinkButton label="Qamar360 website" url={Links.website}>
        <AppIcon name="globe" size={GLYPH} color={tint} />
      </LinkButton>
      <LinkButton label="Qamar360 on Instagram" url={Links.instagram}>
        <InstagramLogo size={GLYPH} color={tint} />
      </LinkButton>
      <LinkButton label="Qamar360 on X" url={Links.x}>
        <XLogo size={GLYPH} color={tint} />
      </LinkButton>
    </View>
  );
}

function LinkButton({ label, url, children }: { label: string; url: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      scaleTo={Scale.glyph}
      accessibilityRole="link"
      accessibilityLabel={label}
      android_ripple={{ color: theme.backgroundSelected, borderless: true }}
      style={styles.button}>
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  // A comfortable 44pt tap target around each glyph.
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
