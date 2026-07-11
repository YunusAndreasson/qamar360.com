import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * The completion aura — a warm radial bloom of moonlight (`theme.glow`). Rendered behind a moon
 * disc, which occludes the bright centre, so what shows is a soft halo around the body: the emblem
 * "lit up". Non-interactive; render it first (underneath). Used by the Progress hero (when the whole
 * month is done) and by the day-complete celebration (wrap it to animate the bloom in).
 */
export function HeroGlow({ size }: { size: number }) {
  const theme = useTheme();
  const uid = useId();
  const id = `hero-glow-${uid}`;
  const r = size / 2;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={theme.glow} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={theme.glow} stopOpacity={0.16} />
            <Stop offset="1" stopColor={theme.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { alignItems: 'center', justifyContent: 'center' },
});
