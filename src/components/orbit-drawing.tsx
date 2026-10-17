import { BlurMask, Circle, Group, Path, RadialGradient, SweepGradient, vec, type AnimatedProp } from '@shopify/react-native-skia';

import { MoonBloom, MoonBody } from '@/components/moon-body';
import { mixHex, withAlpha } from '@/lib/color';
import { octagramStar } from '@/lib/geometry';

// Exported for the reading sheet's legend, which redraws these marks at glyph scale. The legend
// quotes the instrument rather than approximating it — the last time a legend carried its own
// numbers they drifted (an 8×7 CSS triangle against the ring's 10×10).
export const ORBIT_SIZE = 232;
// The band is the reading, so it is given enough ink to be one. Raising it also shrinks the moon,
// because MOON_SIZE is derived from it below — which is the trade this card needed: at 12 the disc
// carried 3.6x the ink of the whole band while being, by the sheet's own admission, not your
// progress. At 16 that is 2.5x, and the gauge is legible without the moon leaving.
export const RING_STROKE = 16;
// The moon fills the orbit's interior exactly as a day-grid cell fills its ring
// (disc = box − 3×stroke, leaving a stroke/2 gap to the ring). 232 − 3×16 = 184. The size is
// DERIVED, so raising RING_STROKE to give the band enough ink to read as a gauge is what shrank it.
const MOON_SIZE = ORBIT_SIZE - RING_STROKE * 3;
// The halo's star radiates past the orbit into the card, and fixes the canvas: everything else is
// drawn inside it. The orbit card's bottom inset makes room for its lowest rays.
const HALO_SIZE = 330;
/** The canvas is the halo's square, centred on the orbit's box. */
export const ORBIT_CANVAS = HALO_SIZE;
/** Where the canvas sits relative to the orbit's own 232pt box (it runs past it on every side). */
export const ORBIT_CANVAS_OFFSET = (ORBIT_SIZE - ORBIT_CANVAS) / 2;
// The completion bloom: an aura, smaller than the halo so it never becomes a wash.
const GLOW_SIZE = 300;
/** The ring's centre and radius on the canvas. */
export const RING_CENTER = ORBIT_CANVAS / 2;
export const RING_RADIUS = (ORBIT_SIZE - RING_STROKE) / 2;
// The light at the stripe's head: a halo drawn OUTSIDE the cap only ("outer" blur), so it brightens
// the dark around the front of the stripe without smudging the stripe itself.
const HEAD_GLOW_BLUR = 6;
// The glint that goes round a closed orbit once: a short stretch of moonlight, as a share of it.
export const GLINT_SHARE = 0.09;

// The ring as one path that starts at the top and runs clockwise, so trimming it from 0 draws a
// stripe from 12 o'clock like a clock hand, and the sweep gradient can be laid along it.
const C = RING_CENTER;
const R = RING_RADIUS;
const RING_PATH = `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C} ${C + R} A ${R} ${R} 0 1 1 ${C} ${C - R}`;
const HALO_STAR = octagramStar(C, C, HALO_SIZE * 0.44, HALO_SIZE * 0.44 * 0.46);
// The sweep gradient starts at 3 o'clock; turned a quarter back, its 0° is the stripe's start.
const FROM_TOP = [{ rotate: -Math.PI / 2 }];

type OrbitColors = {
  /** The groove: the whole 360°. */
  track: string;
  /** The stripe's head: where the month has got to. */
  head: string;
  /** A closed orbit, and the moon's light. */
  complete: string;
  /** The completion bloom and the glint. */
  glow: string;
  /** The halo's hairlines. */
  pattern: string;
  /** The card, which backs the moon. */
  base: string;
};

type OrbitDrawingProps = {
  colors: OrbitColors;
  /** The halo's line opacity, already dimmed for the light page. */
  haloOpacity: number;
  /** The month is kept whole (the target, not the sweep): the stripe is warm, and the bloom lights. */
  closed: boolean;
  illumination: number;
  waxing: boolean;
  /** How far round the stripe is drawn, 0–1. */
  progress: AnimatedProp<number>;
  /** The same, in degrees, for the sweep gradient's end: the gradient is laid along the stripe as
   *  it stands, so its head is always the brightest point. */
  sweepEnd: AnimatedProp<number>;
  /** The stripe's head, on the canvas. */
  headX: AnimatedProp<number>;
  headY: AnimatedProp<number>;
  /** 1 while there is a stripe at all; its two round caps. */
  capOpacity: AnimatedProp<number>;
  /** The light at the head: out on an empty ring and at the close. */
  headGlowOpacity: AnimatedProp<number>;
  glintStart: AnimatedProp<number>;
  glintEnd: AnimatedProp<number>;
  glintOpacity: AnimatedProp<number>;
  /** The moon's slow breath. */
  moonGlow: AnimatedProp<number>;
};

/**
 * The Progress orbit, drawn in Skia as one picture: the halo's star, the groove, your stripe, the
 * light at its head, the glint when it closes, the bloom, and the moon.
 *
 * One canvas because these are one object. Drawn half in Skia and half in SVG, two renderers' edges
 * and blurs would meet inside a single composition, which is the one place a mismatch shows.
 *
 * The stripe is laid with a sweep gradient, a step down at its start rising to the full accent at
 * its head, so it reads as travelling from the 1st to today rather than as a uniform band. Its arc
 * is butt-ended with the two round caps drawn as discs: a round cap would overhang 0° and pick up
 * the gradient's far end there, and when the stripe nears the close its head must lie OVER its
 * tail, which only a separately drawn cap can. A closing month drops the gradient for solid warm
 * moonlight.
 *
 * Every animated value arrives as a prop, already derived, so the drawing is a function of its
 * inputs and renders the same headless as on a device.
 */
// The stripe's start, as a share of the way from the groove to the accent. Opaque and in the
// accent's own hue, so the gradient deepens rather than greys (a desaturated track tone at the
// tail read as muddy), and close enough to the head that it reads as one stripe gathering light,
// not as a stripe fading in.
const TAIL_SHARE = 0.72;

export function OrbitDrawing({
  colors,
  haloOpacity,
  closed,
  illumination,
  waxing,
  progress,
  sweepEnd,
  headX,
  headY,
  capOpacity,
  headGlowOpacity,
  glintStart,
  glintEnd,
  glintOpacity,
  moonGlow,
}: OrbitDrawingProps) {
  const tail = mixHex(colors.track, colors.head, TAIL_SHARE);
  return (
    <Group>
      {closed ? <MoonBloom cx={C} cy={C} size={GLOW_SIZE} color={colors.glow} /> : null}

      {/* The halo: ornament, fading out toward its rays' tips. */}
      <Path path={HALO_STAR} style="stroke" strokeWidth={1} opacity={haloOpacity}>
        <RadialGradient
          c={vec(C, C)}
          r={HALO_SIZE / 2}
          colors={[colors.pattern, colors.pattern, withAlpha(colors.pattern, 0)]}
          positions={[0, 0.66, 1]}
        />
      </Path>

      {/* The groove: the whole 360°, so an empty month still shows the circle there is to fill. */}
      <Path path={RING_PATH} style="stroke" strokeWidth={RING_STROKE} color={colors.track} />

      {/* The stripe, trimmed to where it stands, so the last stretch of a closing month sweeps
          shut rather than snapping. Its caps are discs (see above), coloured as the ends they cap. */}
      <Circle cx={C} cy={C - R} r={RING_STROKE / 2} color={closed ? colors.complete : tail} opacity={capOpacity} />
      <Path path={RING_PATH} style="stroke" strokeWidth={RING_STROKE} start={0} end={progress} color={colors.complete}>
        {closed ? null : (
          <SweepGradient
            c={vec(C, C)}
            colors={[tail, colors.head]}
            start={0}
            end={sweepEnd}
            transform={FROM_TOP}
            origin={vec(C, C)}
          />
        )}
      </Path>
      {/* The light at the head, under its cap: the front of the stripe reads as the place the month
          has got to, not simply where the ink stops. A closed orbit has no front. */}
      {closed ? null : (
        <Circle cx={headX} cy={headY} r={RING_STROKE * 0.5} color={colors.head} opacity={headGlowOpacity}>
          <BlurMask blur={HEAD_GLOW_BLUR} style="outer" />
        </Circle>
      )}
      <Circle cx={headX} cy={headY} r={RING_STROKE / 2} color={closed ? colors.complete : colors.head} opacity={capOpacity} />

      {/* The glint: a stretch of moonlight carried once round a closed orbit, with a bloom wider
          than the stroke. The bloom is what shows at night, where the stripe is already the moon's
          own cream and a brighter dash on it alone is all but invisible. */}
      {closed ? (
        <Group opacity={glintOpacity}>
          <Path
            path={RING_PATH}
            style="stroke"
            strokeWidth={RING_STROKE * 1.6}
            strokeCap="round"
            start={glintStart}
            end={glintEnd}
            color={colors.glow}
            opacity={0.6}>
            <BlurMask blur={12} style="normal" />
          </Path>
          <Path
            path={RING_PATH}
            style="stroke"
            strokeWidth={RING_STROKE * 0.45}
            strokeCap="round"
            start={glintStart}
            end={glintEnd}
            color={colors.glow}
          />
        </Group>
      ) : null}

      {/* The moon last: it is the calendar, resting quiet (dimmer moonlight, still opaque) inside
          the ring that carries the data, and lit to full only when the month is done. */}
      <MoonBody
        cx={C}
        cy={C}
        size={MOON_SIZE}
        illumination={illumination}
        waxing={waxing}
        brightness={closed ? 1 : 0.8}
        light={colors.complete}
        base={colors.base}
        glow={moonGlow}
      />
    </Group>
  );
}
