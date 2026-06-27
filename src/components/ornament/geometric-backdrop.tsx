import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { flowerOfLife, type GCircle } from '@/lib/geometry';

/**
 * A faint flower-of-life field — the app's "ground" texture, built from the same compass
 * that draws every progress ring. Absolutely fills its parent and is non-interactive, so it
 * sits behind content (render it first). The parent clips it: cards already use
 * `overflow: 'hidden'`, and the screen variant lives behind a transparent ScrollView.
 *
 *  - `screen` — a large rosette anchored to the top, bleeding off-edge and fading down, so
 *    each screen reads as a calm lunar sky that content floats over.
 *  - `card`   — the 7-circle seed of life, centred and fading to the card's edges.
 *
 * A radial mask dissolves the field toward its edges so it never meets a hard clip line.
 */
type Variant = 'screen' | 'card';

type FieldConfig = {
  vb: number;
  circles: GCircle[];
  strokeOpacity: number;
  preserveAspectRatio: string;
  fade: { cx: string; cy: string; r: string; solid: number };
};

const SCREEN_VB = 440;
const CARD_VB = 300;

const CONFIG: Record<Variant, FieldConfig> = {
  screen: {
    vb: SCREEN_VB,
    circles: flowerOfLife(SCREEN_VB / 2, 88, 72, 2),
    strokeOpacity: 0.05,
    preserveAspectRatio: 'xMidYMin slice',
    fade: { cx: '50%', cy: '16%', r: '80%', solid: 0.3 },
  },
  card: {
    vb: CARD_VB,
    circles: flowerOfLife(CARD_VB / 2, CARD_VB / 2, 56, 1),
    strokeOpacity: 0.06,
    preserveAspectRatio: 'xMidYMid slice',
    fade: { cx: '50%', cy: '50%', r: '60%', solid: 0.2 },
  },
};

export function GeometricBackdrop({ variant }: { variant: Variant }) {
  const theme = useTheme();
  const uid = useId();
  const cfg = CONFIG[variant];
  const gradId = `bd-grad-${uid}`;
  const maskId = `bd-mask-${uid}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${cfg.vb} ${cfg.vb}`} preserveAspectRatio={cfg.preserveAspectRatio}>
        <Defs>
          <RadialGradient id={gradId} cx={cfg.fade.cx} cy={cfg.fade.cy} r={cfg.fade.r}>
            <Stop offset="0" stopColor="#fff" stopOpacity="1" />
            <Stop offset={String(cfg.fade.solid)} stopColor="#fff" stopOpacity="1" />
            <Stop offset="1" stopColor="#fff" stopOpacity="0" />
          </RadialGradient>
          <Mask id={maskId}>
            <Rect x="0" y="0" width={cfg.vb} height={cfg.vb} fill={`url(#${gradId})`} />
          </Mask>
        </Defs>
        <G mask={`url(#${maskId})`} stroke={theme.pattern} strokeWidth={1} strokeOpacity={cfg.strokeOpacity} fill="none">
          {cfg.circles.map((c, i) => (
            <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
          ))}
        </G>
      </Svg>
    </View>
  );
}
