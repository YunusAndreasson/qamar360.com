import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { octagramStar } from '@/lib/geometry';

/**
 * The signature ornament: an eight-point star whose points radiate past the orbit, framed by
 * two concentric compass arcs (echoing the orbit ring), dissolving outward. Placed behind the
 * moon on Progress and the crescent on sign-in, so the geometry reads as constructed *from*
 * the moon — "the moon generates the order." The star's centre sits behind the moon disc, so
 * only its rays show; absolutely centred in its parent and non-interactive — render it first
 * so the moon/brand sits on top of it.
 */
export function MoonHalo({ size, strokeOpacity = 0.14 }: { size: number; strokeOpacity?: number }) {
  const theme = useTheme();
  const uid = useId();
  const c = size / 2;
  const rOuter = size * 0.44;
  const star = octagramStar(c, c, rOuter, rOuter * 0.46);
  const rings = [rOuter, rOuter * 0.7];
  const gradId = `halo-grad-${uid}`;
  const maskId = `halo-mask-${uid}`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#fff" stopOpacity="1" />
            <Stop offset="0.66" stopColor="#fff" stopOpacity="1" />
            <Stop offset="1" stopColor="#fff" stopOpacity="0" />
          </RadialGradient>
          <Mask id={maskId}>
            <Rect x="0" y="0" width={size} height={size} fill={`url(#${gradId})`} />
          </Mask>
        </Defs>
        <G mask={`url(#${maskId})`} stroke={theme.pattern} strokeWidth={1} strokeOpacity={strokeOpacity} fill="none">
          {rings.map((r, i) => (
            <Circle key={i} cx={c} cy={c} r={r} />
          ))}
          <Path d={star} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
