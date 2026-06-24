import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { moonPhasePath } from '@/lib/moon';

/** The unlit disc — the rest of the moon in shadow, in the shared "potential" tone. */
const FAINT = 0.14;

/**
 * The moon at a given phase: a faint full disc (the moon in shadow) with the lit portion
 * bright on top. Purely presentational — the lunar-month card carries the label. It shows
 * the *true* phase for today's Hijri date, not progress, so it never animates on its own.
 */
export function MoonPhase({
  illumination,
  waxing,
  size = 160,
}: {
  illumination: number;
  waxing: boolean;
  size?: number;
}) {
  const theme = useTheme();
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={r} cy={r} r={r} fill={theme.accent} fillOpacity={FAINT} />
      {illumination > 0.005 ? <Path d={moonPhasePath(r, r, r, illumination, waxing)} fill={theme.accent} /> : null}
    </Svg>
  );
}
