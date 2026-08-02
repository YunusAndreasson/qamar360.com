import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Parallax, Twinkle } from '@/constants/motion';
import { useSkyMotion } from '@/hooks/use-sky-motion';
import type { SkyTilt } from '@/hooks/use-sky-tilt';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { glintPath, STAR_FIELD, starOpacity, type Star, type StarTier } from '@/lib/starfield';
import { starVisibility, type DaylightStarsMode } from '@/lib/sun';

import type { ReactNode } from 'react';

/**
 * The stars of the screen sky (lib/starfield.ts computes the map — tonight's real sky over the
 * observer, or the designed fallback; this renders whatever `stars` it's handed). The field
 * refreshes about once a minute as the sky turns; between refreshes only the twinkle and tilt
 * move. Four layers, all painting the supplied field:
 *
 *  - one still layer for the bright anchors (+ their glints, two of them warm-tinted) — the
 *    constant stars you orient by;
 *  - three breathing layers carrying the mid/faint stars, each one whole-layer opacity driven by
 *    a slow half-cycle from {@link Twinkle}. The periods are mutually incommensurate, so the
 *    combined shimmer drifts like real atmosphere and never reads as a loop. Three shared values
 *    total, all on the UI thread — no re-renders, no per-star animation.
 *
 * Every layer also rides the {@link useSkyTilt} parallax: a whisper of drift as the phone tilts,
 * each layer at its own depth ({@link Parallax.depth}) so the field reads with dimension. Two
 * lights govern the sky, multiplying independently as in the real one: the moon (mid/faint base
 * opacities wane toward the full moon while the bright tier holds) and the sun — as the real sun
 * sinks, the stars emerge bright-tier-first down the twilight ladder ({@link starVisibility}).
 * Dark mode keeps the night-sky identity through daylight (the `inspired` floor: dimmed, never
 * gone); light mode is the literal day side — its sky truly empties, and SCHEME_DIM crushes
 * what remains to barely-there specks. Reduce Motion stills both the breathing and the tilt.
 */
export function StarField({
  stars,
  illumination,
  sunAlt,
  tilt,
}: {
  stars: Star[];
  illumination: number;
  sunAlt: number;
  tilt: SkyTilt;
}) {
  const scheme = useEffectiveScheme();
  // The sun's washout folds into the per-tier scheme dim: one multiplier record drives the
  // layer pruning and per-star opacity alike, so a daylight-empty twinkle layer isn't mounted.
  const mode: DaylightStarsMode = scheme === 'dark' ? 'inspired' : 'literal';
  const schemeDim = scheme === 'light' ? SCHEME_DIM.light : SCHEME_DIM.dark;
  const dim: Record<StarTier, number> = {
    bright: schemeDim.bright * starVisibility('bright', sunAlt, mode),
    mid: schemeDim.mid * starVisibility('mid', sunAlt, mode),
    faint: schemeDim.faint * starVisibility('faint', sunAlt, mode),
  };
  // Product intent over physics, once the sun is actually down. Sun and moon each drown starlight
  // independently, and at a high-latitude summer twilight (Stockholm bottoms out near −7° in
  // August) under a gibbous moon the two multiply out to ~0.06 for the faint tier and ~0.17 for
  // mid — arithmetically correct, and an empty screen. Since the mid and faint tiers are exactly
  // the ones the twinkle layers carry, "the sky stopped moving" is what that looks like. So below
  // the horizon each tier gets a floor: the field still thins with sun and moon, it just never
  // reaches nothing. Above the horizon nothing is floored, so daylight empties the sky as before,
  // and light mode is untouched (it empties on purpose — SCHEME_DIM.light.faint is 0).
  const floored = sunAlt < 0 && scheme === 'dark';
  const floor: Record<StarTier, number> = floored ? NIGHT_FLOOR : NO_FLOOR;
  const anchors = stars.filter((s) => s.tier === 'bright');
  const breathing = ([0, 1, 2] as const).map((group) =>
    stars.filter((s) => s.tier !== 'bright' && s.group === group && dim[s.tier] > 0),
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ParallaxLayer tilt={tilt} depth={Parallax.depth.bright}>
        <StarsSvg stars={anchors} illumination={illumination} dim={dim} floor={floor} />
      </ParallaxLayer>
      {breathing.map((group, i) => (
        <TwinkleLayer
          key={i}
          stars={group}
          half={Twinkle.half[i]!}
          illumination={illumination}
          dim={dim}
          floor={floor}
          tilt={tilt}
          depth={Parallax.depth.dust[i]!}
        />
      ))}
    </View>
  );
}

/** How each tier survives the scheme. Dark is the true night sky; light is daytime — the faint
 *  dust (al-Thurayyā included) doesn't render at all, and the rest are crushed to a whisper. */
const SCHEME_DIM: Record<'light' | 'dark', Record<StarTier, number>> = {
  dark: { bright: 1, mid: 1, faint: 1 },
  light: { bright: 0.35, mid: 0.15, faint: 0 },
};

/** The least a tier may fade to once the sun is below the horizon — see the note in StarField.
 *  Still ordered bright > mid > faint, so the field keeps its depth; it just has a bottom. */
const NIGHT_FLOOR: Record<StarTier, number> = { bright: 0.42, mid: 0.28, faint: 0.17 };
const NO_FLOOR: Record<StarTier, number> = { bright: 0, mid: 0, faint: 0 };

/** The warm anchors' colour — a pale amber (think Aldebaran / Betelgeuse), a subtle temperature
 *  step off the cool `starlight`, never a saturated orange dot. */
const STAR_WARM = '#F2D8B8';

/** Negative insets so a drifting layer always overscans the screen — the tilt shift can never
 *  slide the field's clip edge into view (the sky sits behind content, so the bleed is off-screen). */
const OVERSCAN = {
  top: -Parallax.overscan,
  left: -Parallax.overscan,
  right: -Parallax.overscan,
  bottom: -Parallax.overscan,
} as const;

/** Wraps a sky layer in the tilt-parallax drift at its own depth (far layers move least). The
 *  transform lives entirely on the UI thread; the overscan hides the translated edge. */
function ParallaxLayer({ tilt, depth, children }: { tilt: SkyTilt; depth: number; children: ReactNode }) {
  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: tilt.shiftX.get() * Parallax.maxShift * depth },
      { translateY: tilt.shiftY.get() * Parallax.maxShift * depth },
    ],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, OVERSCAN, drift]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

type LayerProps = {
  stars: Star[];
  illumination: number;
  dim: Record<StarTier, number>;
  floor: Record<StarTier, number>;
};

/** One breathing layer — the month-summary "breath" idiom on the layer's whole opacity, easing
 *  between full and {@link Twinkle.floor} so its stars soften but never wink out — carried inside
 *  its {@link ParallaxLayer} so it also drifts with the phone at its own depth. */
function TwinkleLayer({
  stars,
  half,
  illumination,
  dim,
  floor,
  tilt,
  depth,
}: LayerProps & { half: number; tilt: SkyTilt; depth: number }) {
  const skyMotion = useSkyMotion();
  const empty = stars.length === 0;
  const breath = useSharedValue(0);
  useEffect(() => {
    // Also parked while the layer is empty (daylight prunes whole tiers): rendering null below
    // doesn't stop a running `withRepeat`, and an invisible layer must not keep a perpetual
    // UI-thread animation alive.
    breath.set(
      !skyMotion || empty
        ? 0
        : withRepeat(withTiming(1, { duration: half, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [skyMotion, empty, half, breath]);
  const twinkle = useAnimatedStyle(() => ({ opacity: 1 - breath.get() * (1 - Twinkle.floor) }));

  if (empty) return null;
  return (
    <ParallaxLayer tilt={tilt} depth={depth}>
      <Animated.View style={[StyleSheet.absoluteFill, twinkle]} pointerEvents="none">
        <StarsSvg stars={stars} illumination={illumination} dim={dim} floor={floor} />
      </Animated.View>
    </ParallaxLayer>
  );
}

/** The field itself: points of `starlight` (or `STAR_WARM` for the warm anchors), sized by the
 *  map, faded by moonlight, scheme, and each star's extinction weight (`w` — the sky dims toward
 *  the bottom of the screen). A glinted star also carries its 4-point diffraction hairlines, at
 *  half the point's opacity. */
function StarsSvg({ stars, illumination, dim, floor }: LayerProps) {
  const theme = useTheme();
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox={`0 0 ${STAR_FIELD.width} ${STAR_FIELD.height}`}
      preserveAspectRatio="xMidYMin slice"
    >
      {stars.map((s, i) => {
        // The floor applies to the sun/moon fade, not to `w`: a star still dims toward the bottom
        // of the field (atmospheric extinction), so the sky keeps its depth above the horizon.
        const opacity = Math.max(floor[s.tier], starOpacity(s.tier, illumination) * dim[s.tier]) * s.w;
        return (
          <Circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.warm ? STAR_WARM : theme.starlight}
            fillOpacity={opacity}
          />
        );
      })}
      {stars
        .filter((s) => s.glint)
        .map((s, i) => (
          <Path
            key={`glint-${i}`}
            d={glintPath(s.x, s.y, s.r)}
            stroke={s.warm ? STAR_WARM : theme.starlight}
            strokeWidth={0.6}
            strokeOpacity={0.5 * Math.max(floor[s.tier], starOpacity(s.tier, illumination) * dim[s.tier]) * s.w}
            fill="none"
          />
        ))}
    </Svg>
  );
}
