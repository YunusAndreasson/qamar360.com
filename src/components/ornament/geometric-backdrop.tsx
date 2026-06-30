import { useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { hijriMonthRange, hijriParts, todayLocalISO } from '@/lib/dates';
import { flowerOfLife, type GCircle } from '@/lib/geometry';
import { moonIllumination, moonPhasePath } from '@/lib/moon';

/**
 * A faint flower-of-life field — the app's "ground" texture, built from the same compass
 * that draws every progress ring. Absolutely fills its parent and is non-interactive, so it
 * sits behind content (render it first). The parent clips it: cards already use
 * `overflow: 'hidden'`, and the screen variant lives behind a transparent ScrollView.
 *
 * The whole field is lit as if by one moon high in the upper-right of the sky: every surface
 * blooms toward that source and falls away from it, so the app reads as one lit room.
 *
 *  - `screen` — a fine rosette field whose glow gathers in the upper-right and falls across the
 *    screen, so each screen reads as a calm lunar sky that content floats over.
 *  - `card`   — a fine, small-circle field. Its bloom + fade lean to the (upper-)right toward the
 *    same light, so the texture is strongest on the right and dissolves to the left, clearing the
 *    edge where a card's title/label sits. Kept small on purpose: large circles read as UI elements.
 *  - `hero`   — the large 7-circle seed of life, centred. Reserved for the Progress moon card,
 *    where the rosette blends with the moon disc sitting at its heart — the light source seen up close.
 *
 * A mask dissolves the field toward its edges so it never meets a hard clip line — a centred
 * `radial` fade for screen/hero, or a directional `linear` fade (right → left) for the card.
 */
type Variant = 'screen' | 'card' | 'hero';

/** Centred radial dissolve, or a directional linear one (transparent at the start, solid for
 *  the last `solid` fraction toward the end). */
type Fade =
  | { kind: 'radial'; cx: string; cy: string; r: string; solid: number }
  | { kind: 'linear'; x1: string; y1: string; x2: string; y2: string; solid: number };

type FieldConfig = {
  vb: number;
  circles: GCircle[];
  strokeOpacity: number;
  preserveAspectRatio: string;
  fade: Fade;
};

const SCREEN_VB = 440;
const CARD_VB = 300;

// One *core* opacity for both variants so the screen "sky" and the card watermark read as a
// single, consistent texture (the two used to differ, 0.05 vs 0.06). Each circle's actual
// opacity is this × its luminosity weight, so the field blooms at the heart and recedes —
// the heart sits a touch brighter than the old flat field, the rim far fainter.
const STROKE_OPACITY = 0.075;

const CONFIG: Record<Variant, FieldConfig> = {
  // Finer than the hero: smaller circles + more rings cover the screen as quiet texture, with
  // the glow gathered in the upper-right (the moon) and falling away across the screen.
  screen: {
    vb: SCREEN_VB,
    circles: flowerOfLife(SCREEN_VB / 2, 88, 44, 3, { x: SCREEN_VB * 0.8, y: 36 }),
    strokeOpacity: STROKE_OPACITY,
    preserveAspectRatio: 'xMidYMin slice',
    fade: { kind: 'radial', cx: '80%', cy: '8%', r: '98%', solid: 0.22 },
  },
  // Tiny-circle texture, bloom focal in the upper-right (toward the same light) with a right→left
  // linear fade, so the field is strongest on the right and clears the left where text sits.
  card: {
    vb: CARD_VB,
    circles: flowerOfLife(CARD_VB / 2, CARD_VB / 2, 22, 4, { x: CARD_VB * 0.78, y: CARD_VB * 0.4 }),
    strokeOpacity: STROKE_OPACITY,
    preserveAspectRatio: 'xMidYMid slice',
    fade: { kind: 'linear', x1: '0%', y1: '0%', x2: '100%', y2: '0%', solid: 0.45 },
  },
  // The big seed-of-life that reads beautifully behind the Progress moon — left untouched.
  hero: {
    vb: CARD_VB,
    circles: flowerOfLife(CARD_VB / 2, CARD_VB / 2, 56, 1),
    strokeOpacity: STROKE_OPACITY,
    preserveAspectRatio: 'xMidYMid slice',
    fade: { kind: 'radial', cx: '50%', cy: '50%', r: '60%', solid: 0.2 },
  },
};

/**
 * The screen sky, lit by tonight's real moon. The corner glow is kept exactly where it sits —
 * only its *life* tracks the lunar phase: a faint ember tucked in the corner at the new moon,
 * waxing brighter and reaching a little further across the sky toward the full (laylat al-badr),
 * then hushing back. An average day lands at the field's tuned baseline, so the look stays the
 * one we like; the swing is gentle — felt over the Hijri month, not from one day to the next.
 */
function lunarScreenConfig(illumination: number): FieldConfig {
  const base = CONFIG.screen;
  const intensity = 0.75 + 0.45 * illumination; // ~baseline at half-moon; dimmer → brighter
  const reach = 88 + 22 * illumination; // % the glow reaches out of its corner
  return {
    ...base,
    strokeOpacity: STROKE_OPACITY * intensity,
    fade: base.fade.kind === 'radial' ? { ...base.fade, r: `${Math.round(reach)}%` } : base.fade,
  };
}

export function GeometricBackdrop({ variant }: { variant: Variant }) {
  const theme = useTheme();
  const uid = useId();
  // The whole-screen sky carries tonight's real moon: a faint phase-lit disc in the upper-right,
  // plus a gentle wax/wane of the field's reach. Cards/hero keep their fixed motif.
  const phase = useMemo(() => {
    if (variant !== 'screen') return null;
    const iso = todayLocalISO();
    const parts = hijriParts(iso);
    const range = hijriMonthRange(iso);
    if (!parts || !range) return null; // no Islamic calendar on this runtime — keep the static sky
    return moonIllumination(parts.day, range.length);
  }, [variant]);
  const cfg = phase ? lunarScreenConfig(phase.illumination) : CONFIG[variant];
  const gradId = `bd-grad-${uid}`;
  const maskId = `bd-mask-${uid}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${cfg.vb} ${cfg.vb}`} preserveAspectRatio={cfg.preserveAspectRatio}>
        <Defs>
          {cfg.fade.kind === 'linear' ? (
            // Directional dissolve: transparent at the start (left), ramping to solid for the
            // last `solid` fraction toward the end (right).
            <LinearGradient id={gradId} x1={cfg.fade.x1} y1={cfg.fade.y1} x2={cfg.fade.x2} y2={cfg.fade.y2}>
              <Stop offset="0" stopColor="#fff" stopOpacity="0" />
              <Stop offset={String(1 - cfg.fade.solid)} stopColor="#fff" stopOpacity="1" />
              <Stop offset="1" stopColor="#fff" stopOpacity="1" />
            </LinearGradient>
          ) : (
            <RadialGradient id={gradId} cx={cfg.fade.cx} cy={cfg.fade.cy} r={cfg.fade.r}>
              <Stop offset="0" stopColor="#fff" stopOpacity="1" />
              <Stop offset={String(cfg.fade.solid)} stopColor="#fff" stopOpacity="1" />
              <Stop offset="1" stopColor="#fff" stopOpacity="0" />
            </RadialGradient>
          )}
          <Mask id={maskId}>
            <Rect x="0" y="0" width={cfg.vb} height={cfg.vb} fill={`url(#${gradId})`} />
          </Mask>
        </Defs>
        <G mask={`url(#${maskId})`} stroke={theme.pattern} strokeWidth={1} fill="none">
          {cfg.circles.map((c, i) => (
            // Per-circle opacity = base × luminosity weight: the lattice blooms at its heart
            // (the seed-of-life rosette) and dissolves outward, instead of a flat field.
            <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} strokeOpacity={cfg.strokeOpacity * c.w} />
          ))}
        </G>
      </Svg>
      {phase ? <SkyMoon illumination={phase.illumination} waxing={phase.waxing} /> : null}
      {variant === 'screen' ? <ScreenTint /> : null}
      {variant === 'screen' ? <ScreenVignette /> : null}
    </View>
  );
}

/**
 * The sky leans with the worship day — a whisper of horizon light that warms toward Maghrib (dusk)
 * and cools toward Fajr (dawn), fading to nothing at midday and in the depth of night (the cold mono
 * base). Those threshold hours are exactly the prayer times the app is built around. Kept ≤6% so it
 * is felt over hours, never seen as a tint.
 */
function ScreenTint() {
  const uid = useId();
  const id = `bd-tint-${uid}`;
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const dusk = Math.max(0, 1 - Math.abs(hour - 18.5) / 3.5); // warm, peaks ~Maghrib
  const dawn = Math.max(0, 1 - Math.abs(hour - 5.5) / 3); // cool, peaks ~Fajr
  const warm = dusk >= dawn;
  const strength = warm ? dusk : dawn;
  if (strength <= 0.02) return null; // midday / deep night: pure cold base, no wash
  const color = warm ? '#E8C39A' : '#A9C2E8';
  const opacity = 0.06 * strength;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * A whisper of a vignette — the screen edges fall toward deep space so content reads as floating in
 * a lit room rather than on a flat fill. A real corner-fall in dark, barely there in light (a heavy
 * vignette on a light page reads as dirt). Centre-high, tracking the moon's glow in the upper sky.
 */
function ScreenVignette() {
  const scheme = useEffectiveScheme();
  const uid = useId();
  const id = `bd-vignette-${uid}`;
  const edge = scheme === 'dark' ? 0.4 : 0.05;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="36%" r="80%">
          <Stop offset="0" stopColor="#000" stopOpacity="0" />
          <Stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity={edge} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
    </Svg>
  );
}

/** The moon as the sky's ornament, not as the literal UI moon (that lives on Progress). It's hung
 *  faintly in the upper-right and drawn in the field's own compass-line language: a construction
 *  circle for the body with a thin terminator arc for tonight's phase — so the corner geometry
 *  quietly takes the moon's shape, waxing and waning across the Hijri month. An art representation. */
const MOON_SIZE = 116;

function SkyMoon({ illumination, waxing }: { illumination: number; waxing: boolean }) {
  const theme = useTheme();
  const r = MOON_SIZE / 2;
  return (
    <View style={styles.skyMoon} pointerEvents="none">
      <Svg width={MOON_SIZE} height={MOON_SIZE} viewBox={`0 0 ${MOON_SIZE} ${MOON_SIZE}`}>
        {/* The body — one clean compass circle, in the sky's own line weight (never a filled disc). */}
        <Circle cx={r} cy={r} r={r - 1} stroke={theme.pattern} strokeWidth={1} strokeOpacity={0.16} fill="none" />
        {/* The terminator — a thin arc across the body that gives the corner tonight's phase. */}
        {illumination > 0.03 && illumination < 0.97 ? (
          <Path d={moonPhasePath(r, r, r - 1, illumination, waxing)} stroke={theme.pattern} strokeWidth={1} strokeOpacity={0.16} fill="none" />
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // High in the top-right band — mostly clear of the content below, a moon in the sky.
  skyMoon: { position: 'absolute', top: 6, right: 12 },
});
