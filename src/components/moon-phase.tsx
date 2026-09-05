import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { moonPhasePath } from '@/lib/moon';

/** The unlit disc — the rest of the moon in shadow, a faint wash of the moon's own moonlight. */
const FAINT = 0.14;

/** The limb, for a moon small enough to be mistaken for something else. See `rim`. */
const RIM_OPACITY = 0.32;
const RIM_WIDTH = 0.045; // of the diameter — ~1.2pt on a 26pt row glyph, ~2pt on a 44pt card one

/**
 * The moon at a given phase: a faint full disc (the moon in shadow) with the lit portion
 * bright on top. Purely presentational — the lunar-month card carries the label. It shows
 * the *true* phase for today's Hijri date, not progress, so it never animates on its own.
 */
export function MoonPhase({
  illumination,
  waxing,
  size,
  brightness = 1,
  rim = false,
  onSky = false,
}: {
  illumination: number;
  waxing: boolean;
  size: number;
  /**
   * How brightly the moonlight reads (0–1). Below 1 dims only the lit moonlight while the base disc
   * stays fully opaque — so the moon can rest quiet behind a louder progress ring without turning
   * translucent and letting the halo bleed through. The Progress hero lights it to full at completion.
   */
  brightness?: number;
  /**
   * Trace the limb in the moon's own light — earthshine, in effect: the edge of the disc stays
   * visible however little of it the sun is on.
   *
   * For the moons that sit in a LIST, where the glyph is a row's leading mark and not the subject.
   * A new moon is 14% of one colour on a card of nearly the same colour, so on the Insights feed
   * every fourth row led with what looked like a failed image while its three neighbours led with
   * a bright disc — the reader's eye reads that as a fault, not as a phase. A hairline says "this
   * is a moon, and it is dark", which is the actual fact.
   *
   * Off by default, and deliberately off on the hero: that moon is 184pt inside a 232pt ring, and
   * a rim on it would simply be a fourth concentric circle in a composition already carrying three.
   */
  rim?: boolean;
  /**
   * Drop the opaque base disc, for a moon drawn straight onto the app's own sky rather than onto
   * a card.
   *
   * The base exists to make the moon an *object* — it occludes the halo behind it so the shadowed
   * side reads as shadow and not as glass. That backing is `backgroundElement`, which is the
   * colour of a card: in light mode pure white. Over the transparent nav header (which shows the
   * fixed starfield through it) that is a white coin, not a moon. With this on, the shadowed side
   * is simply the sky — which is what a real dark limb looks like — and {@link rim} does the work
   * of saying "there is a disc here" at the phases where almost nothing is lit.
   */
  onSky?: boolean;
}) {
  const theme = useTheme();
  const r = size / 2;
  // Inset by half the stroke: a stroke is centred on its path, so one drawn at the full radius
  // would hang half its width outside the viewBox and be shaved off by the SVG's own bounds.
  const rimWidth = Math.max(1, size * RIM_WIDTH);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Solid base so the moon is an opaque object — it occludes the halo behind it, rather
          than the unlit limb letting the geometry shine through. Matches the card surface, so
          the shadowed side looks exactly as it did before the halo existed. */}
      {onSky ? null : <Circle cx={r} cy={r} r={r} fill={theme.backgroundElement} />}
      <Circle cx={r} cy={r} r={r} fill={theme.complete} fillOpacity={FAINT * brightness} />
      {illumination > 0.005 ? (
        <Path d={moonPhasePath(r, r, r, illumination, waxing)} fill={theme.complete} fillOpacity={brightness} />
      ) : null}
      {rim ? (
        <Circle
          cx={r}
          cy={r}
          r={r - rimWidth / 2}
          stroke={theme.complete}
          strokeOpacity={RIM_OPACITY * brightness}
          strokeWidth={rimWidth}
          fill="none"
        />
      ) : null}
    </Svg>
  );
}
