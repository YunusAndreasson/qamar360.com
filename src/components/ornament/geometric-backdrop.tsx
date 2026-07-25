import { useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Meteors } from '@/components/ornament/meteors';
import { StarField } from '@/components/ornament/star-field';
import { Parallax } from '@/constants/motion';
import { useMinuteTick } from '@/hooks/use-minute-tick';
import { useSkyTilt, type SkyTilt } from '@/hooks/use-sky-tilt';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { hijriMonthRange, hijriParts, todayLocalISO } from '@/lib/dates';
import { deviceLocation } from '@/lib/geo';
import { flowerOfLife, type GCircle } from '@/lib/geometry';
import { moonIllumination } from '@/lib/moon';
import { moonHorizontal, sunHorizontal } from '@/lib/sky';
import { realSkyField, starField } from '@/lib/starfield';
import { horizonTint, starVisibility, type DaylightStarsMode } from '@/lib/sun';

/**
 * The app's backdrop ornament. Absolutely fills its parent and is non-interactive, so it
 * sits behind content (render it first). The parent clips it: cards already use
 * `overflow: 'hidden'`, and the screen variant lives behind a transparent ScrollView.
 *
 *  - `screen` — the night sky itself: the real stars overhead right now ({@link StarField}) under an
 *    implied moon in the upper-right. The moon is felt, not seen — no drawn disc (the literal
 *    moon lives on Progress); what marks it is the order it casts: a faint seed-of-life bloom
 *    of construction circles gathered at that corner ({@link CornerBloom}), waxing gently with
 *    the real lunar phase while the faint stars wash out beneath it — one light rises, the
 *    others yield. "The moon generates the order."
 *  - `card`   — a fine, small-circle flower-of-life field. Its bloom + fade lean to the
 *    (upper-)right toward the same light, so the texture is strongest on the right and dissolves
 *    to the left, clearing the edge where a card's title/label sits. Kept small on purpose:
 *    large circles read as UI elements.
 *  - `hero`   — the large 7-circle seed of life, centred. Reserved for the Progress moon card,
 *    where the rosette blends with the moon disc sitting at its heart — the light source seen up close.
 *
 * A mask dissolves each lattice toward its edges so it never meets a hard clip line.
 */
type Variant = 'screen' | 'card' | 'hero';

/** Centred radial dissolve, or a directional linear one (transparent at the start, solid for
 *  the last `solid` fraction toward the end). */
type Fade =
  | { kind: 'radial'; cx: string; cy: string; r: string; solid: number }
  | { kind: 'linear'; x1: string; y1: string; x2: string; y2: string; solid: number };

// Both lattices share the same viewBox, aspect handling, and slice mode — only their circle
// pattern and edge fade differ, so those are all the config carries.
type FieldConfig = { circles: GCircle[]; fade: Fade };

const CARD_VB = 300;
const ASPECT = 'xMidYMid slice';

// One *core* opacity for every lattice (cards, hero, the corner bloom) so the geometry reads
// as a single, consistent etching wherever it appears. Each circle's actual opacity is this ×
// its luminosity weight, so a field blooms at the heart and recedes. Kept low enough to
// whisper, but high enough that the rosette actually reads on both the deep-space and the
// near-white background (it had faded to near-invisible, especially in light mode).
const STROKE_OPACITY = 0.12;

const CONFIG: Record<'card' | 'hero', FieldConfig> = {
  // Tiny-circle texture, bloom focal in the upper-right (toward the same light) with a right→left
  // linear fade, so the field is strongest on the right and clears the left where text sits.
  card: {
    circles: flowerOfLife(CARD_VB / 2, CARD_VB / 2, 22, 4, { x: CARD_VB * 0.78, y: CARD_VB * 0.4 }),
    fade: { kind: 'linear', x1: '0%', y1: '0%', x2: '100%', y2: '0%', solid: 0.45 },
  },
  // The big seed-of-life that reads beautifully behind the Progress moon — left untouched.
  hero: {
    circles: flowerOfLife(CARD_VB / 2, CARD_VB / 2, 56, 1),
    fade: { kind: 'radial', cx: '50%', cy: '50%', r: '60%', solid: 0.2 },
  },
};

export function GeometricBackdrop({ variant }: { variant: Variant }) {
  return variant === 'screen' ? <ScreenSky /> : <RosetteField variant={variant} />;
}

/**
 * The whole-screen sky, living through the real day: the overhead galactic glow, the stars, the
 * corner order-bloom, a rare meteor, then the sun's horizon wash, the vignette, and the horizon
 * lift rising off the bottom edge. Two unseen lights govern the composition. Tonight's real moon
 * brightens the bloom and drowns the faint stars and the glow; the real sun — computed for the
 * same observer, once a minute — washes the stars out by day and hands them back tier by tier
 * through the true twilight bands, while the horizon warms toward sunset and cools toward dawn
 * ({@link sun.ts}). Neither light is ever drawn. The whole field also drifts a whisper with the
 * phone's tilt ({@link useSkyTilt}), each layer at its own depth so the sky reads dimensional,
 * not flat.
 */
function ScreenSky() {
  const scheme = useEffectiveScheme();
  // Light mode dims the ornament (dark-steel `pattern` lines on a white page read stronger
  // than pale lines on deep space) — gently; a heavy cut fades it to invisible.
  const dim = scheme === 'light' ? 0.8 : 1;
  const tilt = useSkyTilt();
  const now = useMinuteTick();

  // The phase is derived from the tick's day, NOT frozen at mount: this sky lives inside the
  // eager-mounted tabs and can stay mounted for days — a mount-time snapshot would keep painting
  // a stale Hijri day's bloom and washout after midnight while the stars beside it move on.
  const dayISO = todayLocalISO(now);
  const illumination = useMemo(() => {
    const parts = hijriParts(dayISO);
    const range = hijriMonthRange(dayISO);
    if (!parts || !range) return 0.5; // no Islamic calendar on this runtime — an average sky
    return moonIllumination(parts.day, range.length).illumination;
  }, [dayISO]);

  // Tonight's real sky over the observer (placed by timezone — no permission). The location is
  // re-read on each minute render (a cheap Intl + map lookup) so travel that changes the
  // timezone self-corrects, the same way useSunCycle re-reads it per check. Recomputed once a
  // minute as the sky turns; the designed field is the graceful fallback if location or the
  // astronomy ever throws, so the backdrop never breaks.
  const { lat, lon } = deviceLocation();
  const stars = useMemo(() => {
    try {
      const moon = moonHorizontal(now, lat, lon);
      return realSkyField({ lat, lon, date: now, moon });
    } catch {
      return starField();
    }
  }, [now, lat, lon]);

  // The real sun over the same observer, on the same minute clock. If the astronomy ever
  // throws, the sky fails into full night — the backdrop's familiar look, never a blank.
  let sun: { alt: number; az: number };
  try {
    sun = sunHorizontal(now, lat, lon);
  } catch {
    sun = { alt: -18, az: 180 };
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <OverheadGlow illumination={illumination} sunAlt={sun.alt} tilt={tilt} />
      <StarField stars={stars} illumination={illumination} sunAlt={sun.alt} tilt={tilt} />
      <CornerBloom illumination={illumination} dim={dim} tilt={tilt} />
      <Meteors sunAlt={sun.alt} />
      <HorizonTint sunAlt={sun.alt} sunAz={sun.az} />
      <ScreenVignette />
      <HorizonGlow sunAlt={sun.alt} />
    </View>
  );
}

// The overhead galactic glow — a broad, soft, cool dome of light gathered at the very top of the
// sky. Diffuse and edgeless (never a disc, never the top-right implied moon): a lift of deep
// indigo over the near-black base that fades to nothing by mid-screen. It washes out toward the
// full moon like the faint stars beneath it, and — being night-sky light itself — fades in step
// with the first stars as the real sun rises.
//
// One colour serves both of the sky's diffuse lights (this dome and the {@link HorizonGlow}
// rising off the bottom edge), so the screen reads as a single atmosphere lit from two ends
// rather than two unrelated washes.
const GLOW_COLOR = '#1E2A52';
const GLOW_OPACITY = 0.08;
const GLOW_LIGHT_DIM = 0.1;
// Overscan so the glow's tilt drift never opens a gap at the top edge (it's the farthest, and
// smallest-moving, layer — but the top is exactly where it's brightest).
const GLOW_OVERSCAN = {
  top: -Parallax.overscan,
  left: -Parallax.overscan,
  right: -Parallax.overscan,
  bottom: -Parallax.overscan,
} as const;

function OverheadGlow({ illumination, sunAlt, tilt }: { illumination: number; sunAlt: number; tilt: SkyTilt }) {
  const scheme = useEffectiveScheme();
  const uid = useId();
  const id = `bd-glow-${uid}`;
  // Strongest at the new moon, washed toward the full — the same "moonlight drowns starlight"
  // coupling the faint stars use — and gated by the sun on the bright tier's curve (with its
  // dark-mode floor), so the dome arrives with the anchors, never before them.
  const mode: DaylightStarsMode = scheme === 'dark' ? 'inspired' : 'literal';
  const dim = scheme === 'light' ? GLOW_LIGHT_DIM : 1;
  const peak = GLOW_OPACITY * (1 - 0.6 * illumination) * dim * starVisibility('bright', sunAlt, mode);
  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: tilt.shiftX.get() * Parallax.maxShift * Parallax.depth.glow },
      { translateY: tilt.shiftY.get() * Parallax.maxShift * Parallax.depth.glow },
    ],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, GLOW_OVERSCAN, drift]} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {/* Stretched by the square→screen aspect into a wide, shallow overhead ellipse. */}
          <RadialGradient id={id} cx="46%" cy="2%" r="72%">
            <Stop offset="0" stopColor={GLOW_COLOR} stopOpacity={peak} />
            <Stop offset="0.55" stopColor={GLOW_COLOR} stopOpacity={peak * 0.35} />
            <Stop offset="1" stopColor={GLOW_COLOR} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** The card/hero lattice — a masked flower-of-life field, unchanged from the original ground
 *  texture (the screen variant grew into {@link ScreenSky}). */
function RosetteField({ variant }: { variant: 'card' | 'hero' }) {
  const theme = useTheme();
  const scheme = useEffectiveScheme();
  const uid = useId();
  // See ScreenSky — the same gentle light-mode dimming.
  const dim = scheme === 'light' ? 0.8 : 1;
  const cfg = CONFIG[variant];
  const gradId = `bd-grad-${uid}`;
  const maskId = `bd-mask-${uid}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${CARD_VB} ${CARD_VB}`} preserveAspectRatio={ASPECT}>
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
            <Rect x="0" y="0" width={CARD_VB} height={CARD_VB} fill={`url(#${gradId})`} />
          </Mask>
        </Defs>
        <G mask={`url(#${maskId})`} stroke={theme.pattern} strokeWidth={1} fill="none">
          {cfg.circles.map((c, i) => (
            // Per-circle opacity = base × luminosity weight: the lattice blooms at its heart
            // (the seed-of-life rosette) and dissolves outward, instead of a flat field.
            <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} strokeOpacity={STROKE_OPACITY * c.w * dim} />
          ))}
        </G>
      </Svg>
    </View>
  );
}

/**
 * The order the unseen moon casts — a small seed-of-life lattice tucked into the upper-right,
 * dissolving into the starfield within a third of the screen. Positioned as an absolute corner
 * overlay (the old SkyMoon's slot) rather than inside the sliced star viewBox, so it hugs the
 * physical corner on every screen aspect. Its life tracks the lunar phase: a faint ember at the
 * new moon, waxing brighter toward the full (laylat al-badr), then hushing back — the inverse
 * of the faint stars beneath it. Nothing here is drawn moon-shaped: no disc, no terminator.
 */
const BLOOM_SIZE = 280;
// 19 construction circles (rings=2) in the old screen lattice's circle size, blooming from the
// bloom's own heart — which the corner offsets below hang just off-screen, where the moon "is".
const BLOOM_CIRCLES = flowerOfLife(BLOOM_SIZE / 2, BLOOM_SIZE / 2, 44, 2);

function CornerBloom({ illumination, dim, tilt }: { illumination: number; dim: number; tilt: SkyTilt }) {
  const theme = useTheme();
  const uid = useId();
  const gradId = `bloom-grad-${uid}`;
  const maskId = `bloom-mask-${uid}`;
  // ~Baseline at the half moon; a faint ember at the new, fullest reach at the badr.
  const intensity = 0.75 + 0.45 * illumination;
  // The implied moon-light is far — it barely drifts with the tilt (a small depth factor).
  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: tilt.shiftX.get() * Parallax.maxShift * Parallax.depth.bloom },
      { translateY: tilt.shiftY.get() * Parallax.maxShift * Parallax.depth.bloom },
    ],
  }));

  return (
    <Animated.View style={[styles.bloom, drift]} pointerEvents="none">
      <Svg width={BLOOM_SIZE} height={BLOOM_SIZE} viewBox={`0 0 ${BLOOM_SIZE} ${BLOOM_SIZE}`}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" r="48%">
            <Stop offset="0" stopColor="#fff" stopOpacity="1" />
            <Stop offset="0.15" stopColor="#fff" stopOpacity="1" />
            <Stop offset="1" stopColor="#fff" stopOpacity="0" />
          </RadialGradient>
          <Mask id={maskId}>
            <Rect x="0" y="0" width={BLOOM_SIZE} height={BLOOM_SIZE} fill={`url(#${gradId})`} />
          </Mask>
        </Defs>
        <G mask={`url(#${maskId})`} stroke={theme.pattern} strokeWidth={1} fill="none">
          {BLOOM_CIRCLES.map((c, i) => (
            <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} strokeOpacity={STROKE_OPACITY * c.w * dim * intensity} />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}

/**
 * The sky leans with the worship day — a whisper of horizon light riding the *real* sun's
 * altitude ({@link horizonTint}): golden hour kindles as the sun drops low, burns warmest at
 * sunset (Maghrib), hands over to the blue hour through civil twilight, and mirrors cool-first
 * around dawn (Fajr) — fading to nothing in full day and deep night (the cold mono base). Those
 * thresholds are the sun positions the prayer day is built around, not clock hours. Kept ≤8% so
 * it is felt over hours, never seen as a tint.
 */
function HorizonTint({ sunAlt, sunAz }: { sunAlt: number; sunAz: number }) {
  const uid = useId();
  const id = `bd-tint-${uid}`;
  const tint = horizonTint(sunAlt, sunAz);
  if (!tint) return null; // full day / deep night: pure cold base, no wash
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tint.color} stopOpacity={tint.opacity} />
          <Stop offset="0.55" stopColor={tint.color} stopOpacity="0" />
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

/**
 * The horizon lift — the sky's other diffuse light, rising off the *absolute bottom edge* of the
 * screen and dissolving into darkness before mid-page. Where {@link OverheadGlow} is the galactic
 * dome gathered at the zenith, this is the last light along the horizon: the faint airglow the
 * eye reads as depth, so the page ends in atmosphere instead of on a flat fill.
 *
 * Two passes, because the only sky a full screen actually leaves visible is a narrow strip — the
 * content margins and the exhale above the tab bar:
 *
 *  - a full-width vertical ramp, so the lift reaches those very edges (a lone bottom-centred
 *    dome decays to ~1% of its peak by the screen sides — invisible exactly where it is needed);
 *  - a bottom-centred dome over it, so the band still gathers toward a light source instead of
 *    lying flat across the foot of the page like a UI scrim.
 *
 * The ramp accelerates into the edge rather than climbing evenly, which is what keeps it reading
 * as glow rather than as a gradient.
 *
 * Deliberately *not* coupled to the moon: the overhead dome already breathes with the phase, so
 * leaving this one steady gives the sky two independent lives instead of one synchronized pulse.
 * The sun still governs it — it fades with the stars by day, on the bright tier's curve, and
 * holds the dark scheme's night-sky floor.
 *
 * Painted last, over {@link ScreenVignette} — which is what shapes it: the vignette keeps the
 * bottom corners falling away while this lifts the centre, so the result reads as light rising
 * from a horizon. Static on purpose (no tilt drift): this is the frame's own edge-light, the
 * fixed thing the parallax layers move against.
 */
// Peaks together at ~0.1 in the bottom-centre — a touch over the overhead dome's 0.08, since
// this one is read through the content margins rather than across an open sky. Still a felt
// lift, never a visible wash.
const HORIZON_BAND_OPACITY = 0.055;
const HORIZON_DOME_OPACITY = 0.05;

/** Where the tab bar's opaque edge cuts the sky off, as a fraction of screen height — the last
 *  line of sky the eye actually reads, so the lift is shaped to arrive there rather than at the
 *  literal bottom. Approximate by design: it only weights a gradient stop, so a few points of
 *  drift across devices costs nothing. */
const TAB_BAR_EDGE = '0.89';

function HorizonGlow({ sunAlt }: { sunAlt: number }) {
  const scheme = useEffectiveScheme();
  const uid = useId();
  const bandId = `bd-horizon-band-${uid}`;
  const domeId = `bd-horizon-dome-${uid}`;
  const mode: DaylightStarsMode = scheme === 'dark' ? 'inspired' : 'literal';
  const dim = scheme === 'light' ? GLOW_LIGHT_DIM : 1;
  const light = dim * starVisibility('bright', sunAlt, mode);
  const band = HORIZON_BAND_OPACITY * light;
  const dome = HORIZON_DOME_OPACITY * light;

  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        {/* Nothing above the 40% line — the sky up there belongs to the stars — then a ramp
            weighted so ~90% of the lift is reached by {@link TAB_BAR_EDGE}: the bottom tenth of
            the screen is behind an opaque tab bar, and a ramp that saved its climb for the true
            edge would spend it where nobody can see it, leaving the visible strip flat. */}
        <LinearGradient id={bandId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.4" stopColor={GLOW_COLOR} stopOpacity="0" />
          <Stop offset="0.68" stopColor={GLOW_COLOR} stopOpacity={band * 0.22} />
          <Stop offset="0.82" stopColor={GLOW_COLOR} stopOpacity={band * 0.55} />
          <Stop offset={TAB_BAR_EDGE} stopColor={GLOW_COLOR} stopOpacity={band * 0.9} />
          <Stop offset="1" stopColor={GLOW_COLOR} stopOpacity={band} />
        </LinearGradient>
        {/* Stretched by the square→screen aspect into a wide, shallow dome on the bottom edge —
            the mirror of the overhead glow's ellipse, dying out just past mid-screen. */}
        <RadialGradient id={domeId} cx="50%" cy="100%" r="55%">
          <Stop offset="0" stopColor={GLOW_COLOR} stopOpacity={dome} />
          <Stop offset="0.45" stopColor={GLOW_COLOR} stopOpacity={dome * 0.45} />
          <Stop offset="1" stopColor={GLOW_COLOR} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${bandId})`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${domeId})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // Hung off the top-right corner so the bloom's bright heart sits just at the screen edge —
  // ≈70dp in from the right, ≈64dp down: where the sky's light source "is".
  bloom: { position: 'absolute', top: -76, right: -70, width: BLOOM_SIZE, height: BLOOM_SIZE },
});
