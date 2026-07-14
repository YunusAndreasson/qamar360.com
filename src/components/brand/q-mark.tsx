import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * The app's brand mark — the pure-geometric "Q": a perfect 360° circle with the letter's tail
 * crossing it at the lower right. Same geometry as the launcher icon (`assets/logo/qamar-mark.svg`),
 * but drawn as a vector here so it stays crisp at any size and takes the theme's text colour (dark on
 * the light page, light on the night sky) instead of the icon's fixed white-on-black. Used for the
 * sign-in hero. The viewBox is cropped to the mark's padded bounds so `size` maps to the visible mark.
 */
export function QMark({ size = 96, color }: { size?: number; color?: string }) {
  const theme = useTheme();
  const stroke = color ?? theme.text;
  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="140 140 744 744">
        <Circle cx={512} cy={512} r={312} fill="none" stroke={stroke} strokeWidth={40} />
        <Line x1={703} y1={703} x2={789} y2={789} stroke={stroke} strokeWidth={40} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
});
