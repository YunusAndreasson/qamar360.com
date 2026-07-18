/**
 * The night sky — pure star math (the celestial sibling of {@link geometry.ts}).
 *
 * The screen backdrop's stars are *designed*, not random: a fixed seed draws the same sky on
 * every launch (a sky you live under, not a slot machine), placement is blue-noise (no ugly
 * clumps, no voids), brightness follows the real sky's pyramid — a few bright anchors over
 * many faint ones — and the whole field gathers overhead, thinning and dimming toward the
 * bottom of the screen the way atmospheric extinction swallows a real horizon. One true
 * feature hides in the field: al-Thurayyā (the Pleiades), placed at its actual J2000 shape.
 * These helpers return plain data so the ornament component stays purely presentational.
 */
import { STARS, type CatalogStar } from '@/constants/stars';
import { equatorialToHorizontal, siderealTime, type Horizontal } from '@/lib/sky';

/** The field canvas the stars are scattered over. Tall 2:1, so `xMidYMin slice` covers any
 *  phone aspect without star-starving the bottom (a square field would lose half its width
 *  to the slice-crop on a modern phone). */
export const STAR_FIELD = { width: 440, height: 880 } as const;

/** Apparent-magnitude tier. `bright` stars are the sky's fixed anchors — they neither twinkle
 *  nor wash out under moonlight; `mid` and `faint` breathe and fade with the moon. */
export type StarTier = 'bright' | 'mid' | 'faint';

export type Star = {
  x: number;
  y: number;
  /** Point radius in field units. Tier ranges are disjoint (bright > mid > faint). */
  r: number;
  tier: StarTier;
  /** Which of the three slow twinkle layers carries this star. */
  group: 0 | 1 | 2;
  /** Bright tier only: a 4-point diffraction glint (see {@link glintPath}). */
  glint: boolean;
  /** Bright tier only: a warm-tinted anchor (pale amber — a real-star temperature shift, so the
   *  field isn't a single monochrome colour). The renderer picks the warm colour for these. */
  warm: boolean;
  /** Member of al-Thurayyā — exempt from blue-noise spacing (a cluster is *meant* to clump). */
  cluster: boolean;
  /** Extinction weight in [EXTINCTION_FLOOR, 1]: 1 overhead, easing down the field — the
   *  renderer multiplies its base opacity by this (see {@link starField}). */
  w: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** One sky, forever: the fixed seed keeps the field familiar and hand-checkable. (A Hijri-month
 *  seed — a new sky each month — was considered and set aside: every draw would need visual QA.) */
const SKY_SEED = 20260101;

/** Blue-noise floor between scattered stars (field units). The cluster ignores it internally
 *  but scattered stars keep this moat from cluster members too, so al-Thurayyā stays legible.
 *  Sized for the gathered sky: tight enough that the upper band can hold most of the field. */
const MIN_DIST = 28;

/** Stars never sit against the clip edge. */
const EDGE_MARGIN = 12;

/** The implied moon in the upper-right corner (where the order-bloom gathers): real moonlight
 *  glare — no star survives this close to the source, and the bloom stays uncluttered. */
const MOON_ZONE = { x: 378, y: 60, r: 110 };

/**
 * Vertical concentration — the sky lives overhead. Each tier carries an explicit band budget
 * (`bands`: how many of its stars sit in the top / middle / bottom third of the field), so the
 * composition is designed, not sampled: the top third holds ~3/4 of the sky, the bottom third
 * only a pair of stragglers — and whatever sits low is further dimmed by an extinction
 * weight easing to {@link EXTINCTION_FLOOR} at the field's bottom. Both are how a real night
 * sky reads — atmospheric extinction swallows stars toward the horizon — and both keep the
 * lower screen quiet where content lives: sky stays ground, never competing as figure.
 */
const EXTINCTION_FLOOR = 0.28;

/** Falloff steepness. `>1` keeps the overhead sky at near-full weight and drops off faster low —
 *  the gathering reads stronger and the content area (lower screen) stays quieter. */
const EXTINCTION_EXP = 1.5;

/** Extinction weight for a field y — 1 overhead → EXTINCTION_FLOOR at the bottom, on a gentle
 *  power curve so the fade concentrates in the lower sky. */
const extinction = (y: number) =>
  round(1 - (1 - EXTINCTION_FLOOR) * (y / STAR_FIELD.height) ** EXTINCTION_EXP);

/** Tier design: counts follow a magnitude-realistic pyramid (`bands` sums the tier); radius
 *  ranges are disjoint so a star's tier is recoverable from its size alone. Bright stars stay
 *  out of the bottom third entirely (a bright point low on the page pulls the eye off content).
 *  The `bands` heavily favour the top third (~3/4 of the sky overhead, a pair of stragglers
 *  below). First `glints` bright stars get the 4-point glint; first `warm` bright stars get the
 *  pale-amber temperature tint. All tunable. */
const TIERS = [
  { tier: 'bright', bands: [6, 1, 0], rMin: 1.6, rMax: 2.1, glints: 3, warm: 2 },
  { tier: 'mid', bands: [11, 3, 1], rMin: 1.1, rMax: 1.4, glints: 0, warm: 0 },
  { tier: 'faint', bands: [26, 7, 1], rMin: 0.7, rMax: 1.0, glints: 0, warm: 0 },
] as const;

/** Draws attempted per star before giving up (never reached at this field's density). Plain
 *  dart-throwing — first draw clearing the spacing floor wins — because the floor alone gives
 *  the blue-noise read, while "keep the farthest candidate" would even the field back out and
 *  erase the overhead gathering. */
const MAX_DRAWS = 400;

/**
 * al-Thurayyā (the Pleiades) — offsets from Alcyone, derived from the real J2000 positions
 * (ΔRA·cos δ → x, −ΔDec → y, ×20). Tier `faint` is true to the sky: the Pleiades really do
 * drown under a full moon and re-emerge as it wanes. One shared twinkle group, so the cluster
 * shimmers as a single body.
 */
const THURAYYA_ANCHOR = { x: 100, y: 205 };
const THURAYYA: { dx: number; dy: number; r: number }[] = [
  { dx: 0, dy: 0, r: 1.1 }, // Alcyone
  { dx: 7.6, dy: 1.2, r: 0.9 }, // Atlas
  { dx: 7.8, dy: -0.6, r: 0.7 }, // Pleione
  { dx: -11.8, dy: 0, r: 0.9 }, // Electra
  { dx: -5.2, dy: 3.2, r: 0.9 }, // Merope
  { dx: -7.4, dy: -5.2, r: 0.9 }, // Maia
  { dx: -10.4, dy: -7.2, r: 0.8 }, // Taygeta
  { dx: -12.2, dy: -3.6, r: 0.6 }, // Celaeno
];
const THURAYYA_GROUP = 1;

/** Deterministic PRNG (mulberry32) — same seed, same sky. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The designed sky. Placement is Poisson-disc blue noise by dart-throwing: each star takes the
 * first draw that is inside the margins, clear of the moon zone, and at least {@link MIN_DIST}
 * from every placed star — drawn uniformly within the vertical third its tier's band budget
 * assigns it, so the overhead gathering is exact by construction. Bright stars are placed
 * first so the anchors claim the openest sky; the cluster is seated before any of them.
 */
export function starField(seed: number = SKY_SEED): Star[] {
  const rand = mulberry32(seed);
  const stars: Star[] = THURAYYA.map((s) => ({
    x: round(THURAYYA_ANCHOR.x + s.dx),
    y: round(THURAYYA_ANCHOR.y + s.dy),
    r: s.r,
    tier: 'faint',
    group: THURAYYA_GROUP,
    glint: false,
    warm: false, // the real Pleiades are hot blue-white — the cluster stays cool
    cluster: true,
    w: extinction(THURAYYA_ANCHOR.y + s.dy),
  }));

  const minDistTo = (x: number, y: number) =>
    stars.reduce((min, s) => Math.min(min, Math.hypot(s.x - x, s.y - y)), Infinity);

  let scatterIndex = 0;
  for (const t of TIERS) {
    let placed = 0;
    for (let band = 0; band < t.bands.length; band++) {
      // The band's vertical slice of the field, kept inside the margins.
      const yMin = Math.max(EDGE_MARGIN, (STAR_FIELD.height / 3) * band);
      const yMax = Math.min(STAR_FIELD.height - EDGE_MARGIN, (STAR_FIELD.height / 3) * (band + 1));
      for (let i = 0; i < t.bands[band]!; i++) {
        let best: { x: number; y: number } | null = null;
        for (let draw = 0; draw < MAX_DRAWS && !best; draw++) {
          const x = EDGE_MARGIN + rand() * (STAR_FIELD.width - 2 * EDGE_MARGIN);
          const y = yMin + rand() * (yMax - yMin);
          if (Math.hypot(x - MOON_ZONE.x, y - MOON_ZONE.y) < MOON_ZONE.r) continue;
          if (minDistTo(x, y) < MIN_DIST) continue;
          best = { x, y };
        }
        if (!best) continue; // band is full — impossible at these densities, but never crash
        // This star's rank among the bright anchors (bands run top-down, so the glinted and warm
        // anchors always hang in the upper sky). Non-bright tiers don't rank.
        const rank = t.tier === 'bright' ? placed++ : 0;
        stars.push({
          x: round(best.x),
          y: round(best.y),
          r: round(t.rMin + rand() * (t.rMax - t.rMin)),
          tier: t.tier,
          group: (scatterIndex++ % 3) as 0 | 1 | 2,
          glint: t.tier === 'bright' && rank < t.glints,
          warm: t.tier === 'bright' && rank < t.warm,
          cluster: false,
          w: extinction(best.y),
        });
      }
    }
  }
  return stars;
}

/**
 * Phase-coupled base opacity: moonlight drowns starlight. Bright anchors hold steady; the
 * mid field dims a little toward the full moon; the faint dust (al-Thurayyā included) washes
 * out hard — but never to zero. The deliberate inverse of the corner bloom, which *waxes*
 * with the moon: one light rises, the others yield.
 */
export function starOpacity(tier: StarTier, illumination: number): number {
  if (tier === 'bright') return 0.55;
  if (tier === 'mid') return 0.4 * (1 - 0.35 * illumination);
  return 0.3 * (1 - 0.65 * illumination);
}

/**
 * A 4-point glint for the brightest stars: two perpendicular hairlines through the point —
 * the diffraction spike of astrophotography, in the ornament's own compass-line weight.
 * Drawn as a `+` (a star), never an `×` (a sparkle).
 */
export function glintPath(x: number, y: number, r: number): string {
  const g = round(3.5 * r);
  return `M ${round(x - g)} ${round(y)} L ${round(x + g)} ${round(y)} M ${round(x)} ${round(y - g)} L ${round(x)} ${round(y + g)}`;
}

// ── The real sky ─────────────────────────────────────────────────────────────────────────────
// Everything above draws a *designed* sky — a fixed, hand-composed field. What follows renders
// the *actual* sky over a place and instant: the bright-star catalogue (constants/stars.ts),
// each star turned into its live altitude/azimuth (lib/sky.ts) and projected onto the same
// field. The designed field remains the graceful fallback when location or astronomy is
// unavailable (the backdrop's ScreenSky wires that up). Look, framing, and legibility filters
// below are all tunable — the point is a calm backdrop, not a planetarium.

const DEG = Math.PI / 180;

/** Camera centre: we face the culmination meridian — due south in the northern hemisphere, due
 *  north in the southern — at a mid-sky altitude, so the field runs from the horizon at its foot
 *  to past the zenith at its head. The same "sky gathers overhead, content stays quiet below"
 *  read as the designed field, now physically true. */
const LOOK_ALT = 45;
/** Vertical field of view (°). Centre ±50° spans horizon → past-zenith; the horizontal extent
 *  (~±26°) falls out of the field's 2:1 shape — a tall portrait window onto the meridian band. */
const FOV_V = 100;
/** Stars below this altitude (°) are dropped — horizon murk, and it keeps the field's foot
 *  (where content lives) quiet. */
const HORIZON_FLOOR = 3;
/** Altitude (°) at which extinction reaches full brightness; lower stars dim toward the floor. */
const EXT_FULL_ALT = 60;
/** Count cap: when a rich region (the Milky Way) overflows, keep the brightest this many — the
 *  calm read and the render cost both stay bounded. A sparse patch simply yields fewer. */
const MAX_STARS = 80;
/** Moonlight glare: a star within this angle (°) of an above-horizon Moon, and fainter than
 *  {@link MOON_GLARE_MAG}, washes out — the real inverse of the designed field's moon zone. */
const MOON_GLARE_DEG = 12;
const MOON_GLARE_MAG = 2.5;
/** The brightest stars (mag ≤) carry the 4-point diffraction glint. */
const GLINT_MAG = 1.2;
/** Genuinely cool stars (colour temperature ≤, in K) get the warm amber tint — Betelgeuse,
 *  Aldebaran, Arcturus — a real temperature read, not a chosen rank. */
const WARM_KELVIN = 4800;

/** Magnitude → tier + point radius. Ranges stay disjoint (a star's tier is recoverable from its
 *  size), mirroring the designed field. `magLo`/`magHi` bracket the tier so radius interpolates
 *  brightest → rMax, faintest → rMin. */
const REAL_TIERS = [
  { tier: 'bright', magLo: -1.5, magHi: 1.5, rMin: 1.6, rMax: 2.2 },
  { tier: 'mid', magLo: 1.5, magHi: 3.0, rMin: 1.1, rMax: 1.5 },
  { tier: 'faint', magLo: 3.0, magHi: 5.0, rMin: 0.6, rMax: 1.0 },
] as const;

const HALF_W = STAR_FIELD.width / 2;
const HALF_H = STAR_FIELD.height / 2;
/** Stereographic scale: half the field height spans half the vertical FOV (screen ρ = 2·tan(θ/2)). */
const PROJ_SCALE = HALF_H / (2 * Math.tan((FOV_V / 4) * DEG));

type Vec = [number, number, number]; // [east, north, up]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / m, a[1] / m, a[2] / m];
};
/** Unit direction (east, north, up) for a horizontal coordinate. */
const dir = (altDeg: number, azDeg: number): Vec => {
  const a = altDeg * DEG;
  const z = azDeg * DEG;
  const c = Math.cos(a);
  return [c * Math.sin(z), c * Math.cos(z), Math.sin(a)];
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The real sky over `(lat, lon)` at `date`, as the same {@link Star} field the renderer draws.
 * Each catalog star is turned into its live altitude/azimuth, dropped if below the horizon, then
 * stereographically projected onto the field about a fixed look-direction (conformal, so
 * constellations keep their real shapes). Magnitude sets tier + size, colour temperature the warm
 * tint, altitude the extinction fade; an above-horizon Moon washes out the faint stars around it.
 * When a rich region overflows {@link MAX_STARS}, the brightest survive. Pure and deterministic
 * for fixed inputs. `moon` is the Moon's horizontal position (or null when it is down / unknown) —
 * supplied by the caller so this stays independent of the ephemeris source.
 */
export function realSkyField({
  lat,
  lon,
  date,
  moon,
}: {
  lat: number;
  lon: number;
  date: Date;
  moon: Horizontal | null;
}): Star[] {
  const lst = siderealTime(date, lon);
  // Camera basis: forward = look-direction; right = West-on-the-right (facing-a-meridian chart
  // convention); up ≈ toward the zenith.
  const forward = dir(LOOK_ALT, lat >= 0 ? 180 : 0);
  const right = norm(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  const moonDir = moon && moon.alt > 0 ? dir(moon.alt, moon.az) : null;

  const seen: { star: CatalogStar; alt: number; x: number; y: number }[] = [];
  for (const star of STARS) {
    const { alt, az } = equatorialToHorizontal(star.ra, star.dec, lat, lst);
    if (alt < HORIZON_FLOOR) continue;
    const d = dir(alt, az);
    if (moonDir && star.mag > MOON_GLARE_MAG && Math.acos(Math.min(1, Math.max(-1, dot(d, moonDir)))) / DEG < MOON_GLARE_DEG)
      continue;
    const fz = dot(d, forward);
    if (fz <= 0.05) continue; // behind the camera or grazing the edge
    const k = (2 / (1 + fz)) * PROJ_SCALE;
    const x = HALF_W + k * dot(d, right);
    const y = HALF_H - k * dot(d, up);
    if (x < 0 || x > STAR_FIELD.width || y < 0 || y > STAR_FIELD.height) continue;
    seen.push({ star, alt, x, y });
  }

  seen.sort((a, b) => a.star.mag - b.star.mag); // brightest first, so the count cap keeps them
  return seen.slice(0, MAX_STARS).map((c, i) => {
    const t = REAL_TIERS.find((tier) => c.star.mag <= tier.magHi) ?? REAL_TIERS[REAL_TIERS.length - 1]!;
    const r = t.rMax - (t.rMax - t.rMin) * clamp01((c.star.mag - t.magLo) / (t.magHi - t.magLo));
    const wt = EXTINCTION_FLOOR + (1 - EXTINCTION_FLOOR) * clamp01((c.alt - HORIZON_FLOOR) / (EXT_FULL_ALT - HORIZON_FLOOR));
    return {
      x: round(c.x),
      y: round(c.y),
      r: round(r),
      tier: t.tier,
      group: (i % 3) as 0 | 1 | 2,
      glint: c.star.mag <= GLINT_MAG,
      warm: t.tier !== 'faint' && c.star.k > 0 && c.star.k <= WARM_KELVIN,
      cluster: false,
      w: round(wt),
    };
  });
}
