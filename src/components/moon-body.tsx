import {
  Blur,
  Canvas,
  Circle,
  Group,
  ImageShader,
  RadialGradient,
  Shader,
  Skia,
  useImage,
  vec,
  type AnimatedProp,
} from '@shopify/react-native-skia';

import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/lib/color';
import { sunDirection } from '@/lib/moon';

/**
 * The near side of the real moon, from NASA's Lunar Reconnaissance Orbiter, baked by
 * `scripts/gen-moon-texture.mjs`: its surface brightness in red, and in green and blue how its
 * craters and mountains tilt the ground (see the script).
 */
const NEAR_SIDE = require('../../assets/images/moon/near-side.png');

/** The relief channels hold a tilt of ±this; mirrors `RELIEF_RANGE` in the bake. */
const RELIEF_RANGE = 0.5;

/**
 * How fast the day side comes to full light past the terminator. Lommel–Seeliger alone (below)
 * keeps brightening all the way to the limb, which on a quarter moon reads as a lit ball rather
 * than the moon: in a photograph the day side is flat-bright and only a band at the terminator
 * dims. An exposure curve flattens it, `1 − e^(−k·L)`, normalised so the full moon is 1.
 */
const EXPOSURE_KNEE = 2;

/**
 * Deepens the surface's own contrast. The map is normalised for science, and at its own contrast
 * the seas look washed out beside the moon in the sky; a power on linear brightness darkens the
 * maria while the highlands keep their light.
 */
const ALBEDO_CONTRAST = 1.35;

/**
 * Sunlight's strength against the map's brightness, which tops out near half in linear light: this
 * brings the brightest highlands up near white on a fully lit moon and leaves them shy of it at
 * rest (`brightness` 0.8), so a closing month still has light to add.
 */
const SUNLIGHT = 1.5;

/** Earthshine at its strongest (a new moon), as a share of sunlight. */
const EARTHSHINE = 0.045;

/**
 * The width of the terminator's onset, in the sun's incidence. A hard `max(μ₀, 0)` switches a
 * pixel from night to day in one step, and with the relief's tilts that step lands pixel by pixel
 * along the terminator as speckle; a softplus of this width eases each one in. (The sun's own
 * disc gives a real penumbra of about half this.) Written in its overflow-safe form: `e^(μ₀/w)`
 * itself passes a float's range on the bright side.
 */
const DAWN = 0.012;

/**
 * The size the relief was tuned at (the Progress moon). A smaller moon carries less of it: there
 * the same craters span a pixel or two, and at full strength their lit rims read as noise rather
 * than terrain.
 */
const RELIEF_SIZE = 184;

/**
 * The real moon on the GPU: NASA's map of its near side, lit by the sun for tonight's phase.
 *
 * The light is Lommel–Seeliger, the scattering law the moon's dust actually follows: brightness is
 * `μ₀ / (μ₀ + μ)`, μ₀ the sun's incidence and μ the view's. It is why the full moon looks evenly
 * bright out to its rim, a flat disc rather than a ball. Both angles are taken on the terrain's
 * own tilt (the relief channels), so near the terminator, where the sun skims the ground, crater
 * walls facing it catch light and the far walls fall into shadow: the ragged edge of a real quarter
 * moon. At the full moon the sun is behind the viewer, μ₀ = μ on every slope, and the relief
 * vanishes from the light as it does in the sky.
 *
 * The night side is the backing colour plus earthshine: sunlight off the Earth, a little bluer than
 * the sun's, which lights the dark of a young moon enough to make out its seas. It is strongest at
 * the crescent, when the Earth seen from the moon is nearly full, and gone by the full moon.
 *
 * Lit in linear light and encoded back to sRGB, so the dusk band shades the way light does rather
 * than the way numbers do.
 */
const MOON_SHADER = Skia.RuntimeEffect.Make(`
uniform shader surface;
uniform float2 center;
uniform float radius;
uniform float3 sun;
uniform float3 moonlight;
uniform float3 shade;
uniform float earthshine;
uniform float exposure;
uniform float relief;

float lin(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float enc(float c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }

half4 main(float2 p) {
  float2 d = (p - center) / radius;
  float z = sqrt(max(1.0 - dot(d, d), 0.0));
  half4 t = surface.eval(p);
  float albedo = pow(lin(t.r), ${ALBEDO_CONTRAST.toFixed(2)});
  float2 tilt = (float2(t.g, t.b) - 0.5) * ${(2 * RELIEF_RANGE).toFixed(2)} * relief;
  float nx = d.x + tilt.x;
  float nz = z + tilt.y;
  float mu0 = nx * sun.x + nz * sun.z;
  float mu = max(nz, 0.02);
  float lit = max(mu0, 0.0) + ${DAWN} * log(1.0 + exp(-abs(mu0) / ${DAWN}));
  float law = 2.0 * lit / (lit + mu);
  float day = (1.0 - exp(-${EXPOSURE_KNEE.toFixed(1)} * law)) / ${(1 - Math.exp(-EXPOSURE_KNEE)).toFixed(5)};
  float3 ashen = moonlight * float3(0.72, 0.86, 1.0) * earthshine;
  float3 c = shade + albedo * (ashen + moonlight * day * exposure * ${SUNLIGHT.toFixed(2)});
  return half4(enc(c.r), enc(c.g), enc(c.b), 1.0);
}
`)!;

/** A `#RRGGBB` as linear-light RGB, for the shader. */
function linear(hex: string): number[] {
  return Array.from(Skia.Color(hex))
    .slice(0, 3)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}

// The aura: the moon's own light, blurred and laid behind it on screen blend, so it follows the lit
// shape (a crescent glows as a crescent) and adds light where the sky is dark while vanishing on a
// light page.
const AURA_OPACITY = 0.7;
/** The aura's blur, as a share of the moon's size. */
const AURA_BLUR = 0.08;

type MoonBodyProps = {
  cx: number;
  cy: number;
  size: number;
  illumination: number;
  waxing: boolean;
  /** How brightly the moonlight reads (0–1). */
  brightness: number;
  /** Sunlight on the surface: `theme.moonlight`. */
  light: string;
  /** The disc's opaque backing, which its night side shows: `theme.moonNight`. */
  night: string;
  /** Glow into the sky round the lit limb. Needs room past the disc, so not on a moon-sized canvas. */
  aura?: boolean;
  /** A slow luminance dip for a moon that breathes. It dims the sunlight, never the backing, so
   *  the moon stays an opaque object while it does. */
  glow?: AnimatedProp<number>;
};

/**
 * A large moon, drawn in Skia: the real moon in tonight's phase.
 *
 * The phase is the same one `moonPhasePath` draws flat for the small moons (both read the sun's
 * direction off the illumination), so the large moons and the glyph-sized ones agree on how much
 * is lit; only the large ones show the surface, because below a few dozen points it is not
 * visible and a canvas per list row costs more than it shows.
 *
 * Skia elements, not a canvas, so a moon can sit inside a larger composition (the Progress orbit)
 * or alone ({@link LargeMoon}). Until the texture has decoded (a frame or two), only the backing
 * disc is drawn.
 */
export function MoonBody({
  cx,
  cy,
  size,
  illumination,
  waxing,
  brightness,
  light,
  night,
  aura = false,
  glow = 1,
}: MoonBodyProps) {
  const surface = useImage(NEAR_SIDE);
  const r = size / 2;
  const uniforms = {
    center: vec(cx, cy),
    radius: r,
    sun: sunDirection(illumination, waxing),
    moonlight: linear(light),
    shade: linear(night),
    earthshine: EARTHSHINE * (1 - illumination) ** 2,
    exposure: brightness,
    relief: Math.min(1, Math.max(0.4, size / RELIEF_SIZE)),
  };
  const texture = (
    <ImageShader
      image={surface}
      fit="fill"
      rect={{ x: cx - r, y: cy - r, width: size, height: size }}
      sampling={{ filter: 1, mipmap: 2 }}
    />
  );
  return (
    <Group>
      {surface && aura ? (
        <Circle cx={cx} cy={cy} r={r} opacity={AURA_OPACITY} blendMode="screen">
          <Shader source={MOON_SHADER} uniforms={{ ...uniforms, shade: [0, 0, 0], earthshine: 0 }}>
            {texture}
          </Shader>
          <Blur blur={size * AURA_BLUR} />
        </Circle>
      ) : null}
      <Circle cx={cx} cy={cy} r={r} color={night} />
      {surface ? (
        <Circle cx={cx} cy={cy} r={r} opacity={glow}>
          <Shader source={MOON_SHADER} uniforms={uniforms}>
            {texture}
          </Shader>
        </Circle>
      ) : null}
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
 *  day-complete celebration). */
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
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <MoonBody
        cx={size / 2}
        cy={size / 2}
        size={size}
        illumination={illumination}
        waxing={waxing}
        brightness={brightness}
        light={theme.moonlight}
        night={theme.moonNight}
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
