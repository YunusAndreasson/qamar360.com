import { Canvas, Circle, Group, RadialGradient, Shader, Skia, vec, type AnimatedProp } from '@shopify/react-native-skia';

import { useTheme } from '@/hooks/use-theme';
import { mixHex, withAlpha } from '@/lib/color';
import { sunDirection } from '@/lib/moon';

/** The unlit disc: the rest of the moon in shadow, a faint wash of the moon's own light (earthshine,
 *  in effect). The same share `MoonPhase` uses, so a large moon and a small one read as one body. */
const FAINT = 0.14;

/**
 * How quickly the day side comes to full light past the terminator. The moon's own law keeps the
 * disc nearly flat-bright, so this sets only the width of the dusk band: higher is a crisper
 * terminator. At 7 the band is about a sixth of the radius at the quarter, which reads as a lit
 * sphere without the softness turning into blur.
 */
const TERMINATOR_GAIN = 7;

/**
 * The moon, lit as a sphere by the sun, on the GPU.
 *
 * Lommel–Seeliger, the scattering law the moon's surface actually follows: its dust throws light
 * back toward the sun, so the disc looks almost evenly bright out to its very rim (no darkening at
 * the limb) and falls away only near the terminator, which is therefore soft by nature rather than
 * by a blur. The light is `gain · μ₀ / (μ₀ + μ)`, μ₀ the sun's incidence and μ the view's, eased
 * into full light with a smoothstep: a hard clamp leaves a kink where the band meets the day side,
 * and the eye reads a kink in a gradient as a bright line (a Mach band). The night side keeps its
 * faint earthshine.
 */
const MOON_SHADER = Skia.RuntimeEffect.Make(`
uniform float2 center;
uniform float radius;
uniform float3 sun;
uniform float gain;
uniform float4 dayColor;
uniform float4 nightColor;

half4 main(float2 p) {
  float2 d = (p - center) / radius;
  float3 n = float3(d, sqrt(max(1.0 - dot(d, d), 0.0)));
  float mu0 = dot(n, sun);
  float mu = max(n.z, 0.0001);
  float day = mu0 > 0.0 ? smoothstep(0.0, 1.0, clamp(gain * mu0 / (mu0 + mu), 0.0, 1.0)) : 0.0;
  return half4(mix(nightColor, dayColor, day));
}
`)!;

/** A `#RRGGBB` as the shader's float4. */
function rgba(hex: string): number[] {
  return Array.from(Skia.Color(hex));
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
  /** A slow luminance dip for a moon that breathes. It dims the moonlight, never the backing, so
   *  the moon stays an opaque object while it does. */
  glow?: AnimatedProp<number>;
};

/**
 * A large moon, drawn in Skia: the true phase for the date, as a lit sphere.
 *
 * The phase is the same one `moonPhasePath` draws flat for the small moons (both read the sun's
 * direction off the illumination), so a moon is the same moon at every size; only the large ones
 * are lit, because below a few dozen points the shading is not visible and a canvas per list row
 * costs more than it shows. The circle's own edge is antialiased by Skia, so the rim is crisp.
 *
 * Skia elements, not a canvas, so a moon can sit inside a larger composition (the Progress orbit)
 * or alone ({@link LargeMoon}).
 */
export function MoonBody({ cx, cy, size, illumination, waxing, brightness, light, base, glow = 1 }: MoonBodyProps) {
  const r = size / 2;
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r} color={base} />
      <Circle cx={cx} cy={cy} r={r} opacity={glow}>
        <Shader
          source={MOON_SHADER}
          uniforms={{
            center: vec(cx, cy),
            radius: r,
            sun: sunDirection(illumination, waxing),
            gain: TERMINATOR_GAIN,
            dayColor: rgba(mixHex(base, light, brightness)),
            nightColor: rgba(mixHex(base, light, FAINT * brightness)),
          }}
        />
      </Circle>
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
        light={theme.complete}
        base={theme.backgroundElement}
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
