import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { moonPhasePath } from '@/lib/moon';

/** The unlit disc — the rest of the moon in shadow, a faint wash of the moon's own moonlight. */
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
  brightness = 1,
}: {
  illumination: number;
  waxing: boolean;
  size?: number;
  /**
   * How brightly the moonlight reads (0–1). Below 1 dims only the lit moonlight while the base disc
   * stays fully opaque — so the moon can rest quiet behind a louder progress ring without turning
   * translucent and letting the halo bleed through. The Progress hero lights it to full at completion.
   */
  brightness?: number;
}) {
  const theme = useTheme();
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Solid base so the moon is an opaque object — it occludes the halo behind it, rather
          than the unlit limb letting the geometry shine through. Matches the card surface, so
          the shadowed side looks exactly as it did before the halo existed. */}
      <Circle cx={r} cy={r} r={r} fill={theme.backgroundElement} />
      <Circle cx={r} cy={r} r={r} fill={theme.complete} fillOpacity={FAINT * brightness} />
      {illumination > 0.005 ? (
        <Path d={moonPhasePath(r, r, r, illumination, waxing)} fill={theme.complete} fillOpacity={brightness} />
      ) : null}
    </Svg>
  );
}
