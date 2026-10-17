import { useId } from 'react';
import Svg, { Circle, ClipPath, Defs, FeGaussianBlur, Filter, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { moonPhasePath } from '@/lib/moon';

/** The unlit disc — the rest of the moon in shadow, a faint wash of the moon's own moonlight. */
const FAINT = 0.14;

/** The limb, for a moon small enough to be mistaken for something else. See `rim`. */
const RIM_OPACITY = 0.32;
const RIM_WIDTH = 0.045; // of the diameter — ~1.2pt on a 26pt row glyph, ~2pt on a 44pt card one

/**
 * How soft the terminator is, as a share of the diameter: the moon's day fades into its night over
 * a few points, as a real one does, instead of being cut along a line. About 2.6pt on the 184pt
 * Progress moon.
 */
const SOFTNESS = 0.014;
/** The moonlight lost at the very edge of the disc. A real moon is nearly as bright at its rim as
 *  at its centre; this is only enough to read as a sphere rather than a coin. */
const LIMB_SHADE = 0.22;
/** Where the limb's shading begins, as a share of the radius. */
const LIMB_SHADE_FROM = 0.62;
/** Below this the blur would be a fraction of a pixel and the shading invisible, so a moon this
 *  small (a list row, a header glyph) keeps the plain, crisp drawing. */
const SHADED_MIN = 64;

/**
 * The moon at a given phase: a faint full disc (the moon in shadow) with the lit portion
 * bright on top. Purely presentational — the lunar-month card carries the label. It shows
 * the *true* phase for today's Hijri date, not progress, so it never animates on its own.
 *
 * A large moon is shaded: its terminator is soft and its limb dims a little, so it reads as a lit
 * sphere. Both are static (a blur and a gradient that never move), so they cost nothing per frame.
 * The blur is clipped to the disc and the lit shape bleeds past the limb under it, so only the
 * terminator softens and the edge of the moon stays crisp.
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
   * A new moon is 14% of one colour on a card of nearly the same colour, so in a list
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
  // On the light page the shading fades the moon toward white, and at full strength that reads as a
  // vignette rather than a sphere. The same light-mode dimming MoonHalo applies to its lines.
  const limbShade = LIMB_SHADE * (useEffectiveScheme() === 'light' ? 0.55 : 1);
  const uid = useId();
  const r = size / 2;
  // Inset by half the stroke: a stroke is centred on its path, so one drawn at the full radius
  // would hang half its width outside the viewBox and be shaved off by the SVG's own bounds.
  const rimWidth = Math.max(1, size * RIM_WIDTH);
  const shaded = size >= SHADED_MIN;
  const blur = size * SOFTNESS;
  // The canvas runs past the disc by the bleed, so the blur has the lit area beyond the limb to
  // find; the negative margin keeps the moon's layout box exactly `size`.
  const pad = shaded ? Math.ceil(blur * 3) : 0;
  const canvas = size + pad * 2;
  const clipId = `moon-disc-${uid}`;
  const softId = `moon-soft-${uid}`;
  const limbId = `moon-limb-${uid}`;
  const lit = illumination > 0.005;
  return (
    <Svg
      width={canvas}
      height={canvas}
      viewBox={`${-pad} ${-pad} ${canvas} ${canvas}`}
      style={pad > 0 ? { margin: -pad } : undefined}>
      {shaded ? (
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={r} cy={r} r={r} />
          </ClipPath>
          <Filter id={softId} x="-20%" y="-20%" width="140%" height="140%">
            <FeGaussianBlur stdDeviation={blur} />
          </Filter>
          {/* Toward the card, which is what "less moonlight" means here: the same way `brightness`
              dims, so the shading is the moon's own light falling off rather than a grey film. */}
          <RadialGradient id={limbId} cx="50%" cy="50%" r="50%">
            <Stop offset={LIMB_SHADE_FROM} stopColor={theme.backgroundElement} stopOpacity={0} />
            <Stop offset="1" stopColor={theme.backgroundElement} stopOpacity={limbShade} />
          </RadialGradient>
        </Defs>
      ) : null}
      {/* Solid base so the moon is an opaque object — it occludes the halo behind it, rather
          than the unlit limb letting the geometry shine through. Matches the card surface, so
          the shadowed side looks exactly as it did before the halo existed. */}
      {onSky ? null : <Circle cx={r} cy={r} r={r} fill={theme.backgroundElement} />}
      <Circle cx={r} cy={r} r={r} fill={theme.complete} fillOpacity={FAINT * brightness} />
      {lit && shaded ? (
        <G clipPath={`url(#${clipId})`}>
          <Path
            d={moonPhasePath(r, r, r, illumination, waxing, pad)}
            fill={theme.complete}
            fillOpacity={brightness}
            filter={`url(#${softId})`}
          />
        </G>
      ) : lit ? (
        <Path d={moonPhasePath(r, r, r, illumination, waxing)} fill={theme.complete} fillOpacity={brightness} />
      ) : null}
      {lit && shaded ? <Circle cx={r} cy={r} r={r} fill={`url(#${limbId})`} /> : null}
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
