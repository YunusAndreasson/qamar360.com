import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { QMark } from '@/components/brand/q-mark';
import { useTheme } from '@/hooks/use-theme';

/**
 * The auth-screen brand lockup: the geometric "Q" encircling a softly lit moon. Where the raw
 * {@link HeroGlow} is a wide bloom meant to sit *behind* a solid moon disc, this draws a *defined*
 * moon inside the letter's ring — a cool radial contained within the 312-radius circle — so the
 * centre reads as a full moon the "Q" frames, not an undefined halo bleeding into the sky (which is
 * what a bare glow-behind-an-open-outline looks like). The body is lit from just above, echoing the
 * app's one-moon sky; the mark itself stays the crisp theme-coloured vector.
 */
export function BrandHero({ size }: { size: number }) {
  const theme = useTheme();
  const uid = useId();
  const id = `brand-hero-${uid}`;
  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {/* The lit moon, under the mark. Same 140–884 crop as QMark, so it maps onto the letter's
          circle (cx/cy 512, r 312) — the disc sits just inside the ring's inner edge. */}
      <Svg width={size} height={size} viewBox="140 140 744 744" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="42%" r="54%">
            <Stop offset="0" stopColor={theme.glow} stopOpacity={0.32} />
            <Stop offset="0.6" stopColor={theme.glow} stopOpacity={0.1} />
            <Stop offset="1" stopColor={theme.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={512} cy={512} r={288} fill={`url(#${id})`} />
      </Svg>
      <QMark size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
});
