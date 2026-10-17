import { Image } from 'expo-image';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * The sign-in screen's hero: the full-bleed night-street photo, dissolving into the app's
 * ordinary `theme.background` toward the bottom. Below the dissolve line everything is
 * pixel-identical to the app's normal flat background, so the form controls that sit there
 * (buttons, fields) need no on-photo restyling of their own — only the fixed wordmark above
 * this, which sits directly on the photo, needs that treatment (see sign-in.tsx).
 */
export function AuthBackdrop() {
  const theme = useTheme();
  const uid = useId();
  const id = `auth-backdrop-scrim-${uid}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={require('../../../assets/images/auth-hero.webp')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.background} stopOpacity="0" />
            <Stop offset="0.46" stopColor={theme.background} stopOpacity="0" />
            <Stop offset="0.64" stopColor={theme.background} stopOpacity="0.7" />
            <Stop offset="0.76" stopColor={theme.background} stopOpacity="1" />
            <Stop offset="1" stopColor={theme.background} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
