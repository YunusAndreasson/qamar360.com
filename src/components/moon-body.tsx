import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  rect,
  rrect,
  vec,
  type AnimatedProp,
} from '@shopify/react-native-skia';

import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/color';
import { moonPhasePath } from '@/lib/moon';

/** The unlit disc: the rest of the moon in shadow, a faint wash of the moon's own light. The same
 *  share `MoonPhase` uses, so a large moon and a small one read as the same body. */
const FAINT = 0.14;
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

/**
 * How much of {@link LIMB_SHADE} a theme takes. On the light page the shading fades the moon toward
 * white, and at full strength that reads as a vignette rather than a sphere; the same light-mode
 * dimming the halo applies to its lines.
 */
export function useLimbShade(): number {
  return LIMB_SHADE * (useEffectiveScheme() === 'light' ? 0.55 : 1);
}

/** How far a large moon's canvas must run past its disc for the terminator's blur to find lit area
 *  beyond the limb (see {@link MoonBody}). */
function moonBleed(size: number): number {
  return Math.ceil(size * SOFTNESS * 3);
}

type MoonBodyProps = {
  cx: number;
  cy: number;
  size: number;
  illumination: number;
  waxing: boolean;
  /** How brightly the moonlight reads (0–1); the disc behind it stays opaque. */
  brightness: number;
  /** The moonlight: `theme.complete`. */
  light: string;
  /** The disc's own opaque backing, which hides whatever is drawn behind the moon. */
  base: string;
  /** From {@link useLimbShade}. */
  limbShade: number;
  /** A slow luminance dip for a moon that breathes. It dims the moonlight, never the backing, so
   *  the moon stays an opaque object while it does. */
  glow?: AnimatedProp<number>;
};

/**
 * A large moon, drawn in Skia: the true phase for the date, as a lit sphere.
 *
 * The terminator is soft and the limb dims a little. The blur runs on the GPU, and only on the
 * terminator: the lit shape is carried past the limb (`moonPhasePath`'s bleed) and clipped to the
 * disc, so the edge of the moon stays crisp and fully bright.
 *
 * Skia elements, not a canvas, so a moon can sit inside a larger composition (the Progress orbit)
 * or alone ({@link LargeMoon}). Small moons stay SVG (`MoonPhase`): there a blur would be a
 * fraction of a pixel, and a canvas per list row costs more than it shows. Both draw the same
 * `moonPhasePath`, so a moon is the same shape at every size.
 */
export function MoonBody({ cx, cy, size, illumination, waxing, brightness, light, base, limbShade, glow = 1 }: MoonBodyProps) {
  const r = size / 2;
  const blur = size * SOFTNESS;
  const lit = illumination > 0.005;
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r} color={base} />
      <Group opacity={glow}>
        <Circle cx={cx} cy={cy} r={r} color={light} opacity={FAINT * brightness} />
        {lit ? (
          <Group clip={rrect(rect(cx - r, cy - r, size, size), r, r)}>
            <Path path={moonPhasePath(cx, cy, r, illumination, waxing, moonBleed(size))} color={light} opacity={brightness}>
              <BlurMask blur={blur} style="normal" />
            </Path>
          </Group>
        ) : null}
        {/* Toward the backing, which is what "less moonlight" means here: the same way
            `brightness` dims, so the shading is the moon's own light falling off, not a grey film. */}
        {lit ? (
          <Circle cx={cx} cy={cy} r={r}>
            <RadialGradient
              c={vec(cx, cy)}
              r={r}
              colors={[withAlpha(base, 0), withAlpha(base, limbShade)]}
              positions={[LIMB_SHADE_FROM, 1]}
            />
          </Circle>
        ) : null}
      </Group>
    </Group>
  );
}

/**
 * The completion bloom: warm moonlight blooming behind a lit moon and past it. The moon in front
 * hides the bright centre, so what shows is an aura round the body.
 */
export function MoonBloom({ cx, cy, size, color }: { cx: number; cy: number; size: number; color: string }) {
  const r = size / 2;
  return (
    <Circle cx={cx} cy={cy} r={r}>
      <RadialGradient
        c={vec(cx, cy)}
        r={r}
        colors={[withAlpha(color, 0.55), withAlpha(color, 0.16), withAlpha(color, 0)]}
        positions={[0, 0.55, 1]}
      />
    </Circle>
  );
}

/** {@link MoonBody} on its own canvas, for a large moon outside the Progress orbit (the
 *  day-complete celebration). The canvas runs past the disc by the bleed, and a negative margin
 *  keeps the moon's layout box exactly `size`. */
export function LargeMoon({
  illumination,
  waxing,
  size,
  brightness = 1,
}: {
  illumination: number;
  waxing: boolean;
  size: number;
  brightness?: number;
}) {
  const theme = useTheme();
  const limbShade = useLimbShade();
  const pad = moonBleed(size);
  const canvas = size + pad * 2;
  return (
    <Canvas style={{ width: canvas, height: canvas, margin: -pad }} pointerEvents="none">
      <MoonBody
        cx={canvas / 2}
        cy={canvas / 2}
        size={size}
        illumination={illumination}
        waxing={waxing}
        brightness={brightness}
        light={theme.complete}
        base={theme.backgroundElement}
        limbShade={limbShade}
      />
    </Canvas>
  );
}

/** {@link MoonBloom} on its own canvas, for a bloom that animates as a view (the celebration's). */
export function MoonBloomCanvas({ size }: { size: number }) {
  const theme = useTheme();
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <MoonBloom cx={size / 2} cy={size / 2} size={size} color={theme.glow} />
    </Canvas>
  );
}
