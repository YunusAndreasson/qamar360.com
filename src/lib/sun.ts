/**
 * The sun's day — where the real sun turns into the app's daily cycle.
 *
 * The solar sibling of {@link moon.ts}: moon.ts interprets the lunar month, this interprets the
 * solar day. Everything here is a pure function of an explicit instant and place (no clock or
 * locale reads, same doctrine as {@link sky.ts}) in three small vocabularies:
 *
 *  - **Star visibility & horizon tint** ({@link starVisibility}, {@link horizonTint}): the
 *    backdrop's daylight physics. Real twilight bands — civil −6°, nautical −12°, astronomical
 *    −18° — drive when stars emerge (bright anchors first, faint dust last) and how the horizon
 *    wash warms toward sunset and cools toward dawn. Continuous in altitude only, so high
 *    latitudes degrade truthfully with no special cases (a Stockholm June night that never
 *    fully darkens simply… doesn't).
 *  - **Day parts** ({@link dayPartAt}): the coarse chapter of the day — morning / midday /
 *    evening / night — that a stack can anchor to. Deliberately *day-part vocabulary, not
 *    prayer times*: boundaries are solar-geometry conventions (civil twilight, solar noon, the
 *    day's own peak), never a published time to pray by.
 *  - **The display day** ({@link displayDateISO}): the Islamic day begins at sunset, so the
 *    *displayed* Hijri date turns at the real local Maghrib. Tracking stays on the midnight
 *    day-string ({@link dates.ts}) — this is display-only, and must never feed `scheduledOn`.
 */
import { Body, Equator, Observer, SearchRiseSet } from 'astronomy-engine';

import { addDaysISO, localDate, todayLocalISO } from '@/lib/dates';
import { sunHorizontal } from '@/lib/sky';
import type { StarTier } from '@/lib/starfield';

/** The four chapters of the day a stack can anchor to, in day order. */
export const DAY_PARTS = ['morning', 'midday', 'evening', 'night'] as const;
export type DayPart = (typeof DAY_PARTS)[number];

/** Narrow the DB's `text` column (or a stale cached snapshot's missing field) to a DayPart. */
export function asDayPart(value: string | null | undefined): DayPart | null {
  return (DAY_PARTS as readonly string[]).includes(value ?? '') ? (value as DayPart) : null;
}

/** How dark-mode daylight treats the stars: `literal` = the true sky (no stars at noon);
 *  `inspired` = the same transition curves remapped onto a floor, so the night-sky identity
 *  never fully vanishes while the sun is up. Light mode is always literal — light *is* the
 *  day side, and SCHEME_DIM already crushes it. */
export type DaylightStarsMode = 'literal' | 'inspired';

/** Hermite smoothstep on a clamped 0..1 ramp — every curve here uses it so nothing steps. */
function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Per-tier emergence bands (sun altitude, degrees): fully hidden at/above `hi`, fully out
 *  at/below `lo`. Staggered down the real twilight ladder — the brightest stars pop in civil
 *  twilight, the mid field through nautical, the faint dust only by astronomical dark. */
const VISIBILITY_BANDS: Record<StarTier, { hi: number; lo: number }> = {
  bright: { hi: -2, lo: -8 },
  mid: { hi: -6, lo: -12 },
  faint: { hi: -12, lo: -18 },
};

/** `inspired`-mode daytime floors: how much of each tier survives noon in dark mode. */
const DAYLIGHT_FLOORS: Record<StarTier, number> = { bright: 0.7, mid: 0.45, faint: 0.25 };

/**
 * How much of a star tier the sun's altitude lets through, 0..1. Multiplies with the
 * moon-washout ({@link starfield.starOpacity}) and the scheme dim — sun and moon drown
 * starlight independently, as in the real sky.
 */
export function starVisibility(tier: StarTier, sunAltDeg: number, mode: DaylightStarsMode): number {
  const { hi, lo } = VISIBILITY_BANDS[tier];
  const rise = smoothstep((hi - sunAltDeg) / (hi - lo));
  if (mode === 'literal') return rise;
  const floor = DAYLIGHT_FLOORS[tier];
  return floor + (1 - floor) * rise;
}

// The tint's two voices. Warm is an apricot dusk — deliberately more orange than both the
// completion gold (`complete` = bronze; warm-gold means DONE in this app) and the star-amber
// STAR_WARM, so the sky's warmth can never read as achievement. Cool is the dawn steel-blue
// the old clock-hour tint used.
const SUN_WARM = '#E4A97D';
const SUN_COOL = '#A9C2E8';

/** Peak wash opacity — felt over hours, never seen as a tint (the old ScreenTint's discipline). */
const TINT_PEAK = 0.08;

/** A smooth tent: rises from `lo` to `peak`, falls to `hi`, zero outside. */
function tent(alt: number, peak: number, lo: number, hi: number): number {
  if (alt <= lo || alt >= hi) return 0;
  return smoothstep(alt < peak ? (alt - lo) / (peak - lo) : (hi - alt) / (hi - peak));
}

/** Linear mix of two `#RRGGBB` colours, `t` toward `b`. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 0xff;
    const vb = (pb >> shift) & 0xff;
    return Math.round(va + (vb - va) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0').toUpperCase()}`;
}

/** Half-width of the azimuth blend around the 0°/180° meridians (see {@link horizonTint}). */
const MORNING_BLEND_SIN = Math.sin((15 * Math.PI) / 180);

/**
 * The dawn/dusk horizon wash for a sun position, or `null` in full day and deep night (the
 * pure cold base). Two overlapping tents — a warm one peaking just above the horizon (golden
 * hour into sunset fire) and a cool one peaking at civil twilight (the blue hour) — weighted
 * by which side of the sky the sun is on: mornings lean cool with a brief warm blush at
 * sunrise, evenings burn warm and hand over to indigo as the light sinks. Azimuth only picks
 * that weighting; the wash itself stays a vertical top-of-sky gradient — the moon's corner
 * remains the composition's one *located* light.
 *
 * The morning/evening weighting blends smoothly (over ±15° of azimuth, via `sin az`) across the
 * 0° and 180° meridians rather than switching on a boolean: inside the twilight tents the sun
 * *does* cross them — every high-summer midnight at high latitudes (az through 0° near the
 * trough), and subarctic winter noons (az through 180° while the sun is low) — and a hard flip
 * stepped the wash visibly between two adjacent minutes.
 */
export function horizonTint(sunAltDeg: number, sunAzDeg: number): { color: string; opacity: number } | null {
  // 1 fully east/morning, 0 fully west/evening; smooth through both meridian crossings.
  const morningness = smoothstep(0.5 + Math.sin((sunAzDeg * Math.PI) / 180) / (2 * MORNING_BLEND_SIN));
  const warm = tent(sunAltDeg, 1, -6, 8) * (1 - 0.65 * morningness);
  const cool = tent(sunAltDeg, -6, -13, 1) * (0.6 + 0.4 * morningness);
  const strength = Math.min(1, warm + cool);
  if (strength <= 0.02) return null;
  return { color: mixHex(SUN_WARM, SUN_COOL, cool / (warm + cool)), opacity: TINT_PEAK * strength };
}

/** The standard rise/set altitude (refraction + solar semidiameter) — SearchRiseSet's own
 *  convention, reused by the polar guard so both agree on what "the sun rises" means. */
const RISE_SET_ALT = -0.833;

/** Per-day sunset cache (the {@link dates.hijriParts} cache pattern). Keyed on day + rounded
 *  coords — the timezone-derived location can change under a traveller. `null` (polar day or
 *  night: no sunset that day) is a cached value, not a miss. */
const sunsetCache = new Map<string, Date | null>();
const SUNSET_CACHE_MAX = 800;

/**
 * The real local sunset on a `YYYY-MM-DD` local day, or `null` when the sun never sets (or
 * never rises) that day. This is the instant the displayed Hijri date turns — the day's one
 * discrete solar event the app cares about.
 */
export function sunsetOn(dateISO: string, latDeg: number, lonDeg: number): Date | null {
  const key = `${dateISO}|${latDeg.toFixed(2)},${lonDeg.toFixed(2)}`;
  const hit = sunsetCache.get(key);
  if (hit !== undefined) return hit;
  let result: Date | null = null;
  try {
    const found = SearchRiseSet(Body.Sun, new Observer(latDeg, lonDeg, 0), -1, localDate(dateISO), 1);
    result = found ? found.date : null;
  } catch {
    result = null;
  }
  if (sunsetCache.size >= SUNSET_CACHE_MAX) sunsetCache.clear();
  sunsetCache.set(key, result);
  return result;
}

/** Local wall-clock day-part banding — the fallback when the solar day is degenerate (polar
 *  day/night: no sunrise or sunset to hang chapters on). The sun still visits all four
 *  anchors every day. */
function clockDayPart(date: Date): DayPart {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Upper/lower culmination altitudes for the current solar declination — the closed-form
 *  polar-day/night test {@link dayPartAt} bands with, no event search needed. */
function solarCulminations(date: Date, latDeg: number, lonDeg: number): { peak: number; trough: number } {
  const dec = Equator(Body.Sun, date, new Observer(latDeg, lonDeg, 0), true, true).dec;
  return { peak: 90 - Math.abs(latDeg - dec), trough: Math.abs(latDeg + dec) - 90 };
}

/**
 * The instant the current day-part chapter closes. Backs the "until HH:MM" caption beside the
 * lit stack emblem, so the lighting explains itself.
 *
 * Found by root-finding on {@link dayPartAt} ITSELF — a coarse forward scan then a bisection
 * to ~15s — never by an independent altitude search: the banding reads the hand-rolled
 * {@link sunHorizontal}, and astronomy-engine's own altitude model disagrees with it by
 * enough (~0.1–0.6°) to miss a solstice's shallow civil-dusk crossing by many minutes. Same
 * function ⇒ same boundary, by construction — including the wall-clock chapters on
 * degenerate polar days, with no special case. The chapter cycle only moves forward, so even
 * if a stride overleapt a whole short chapter the bisection still converges on the current
 * chapter's true end. ~120 evaluations, called once per minute tick — noise.
 */
export function dayPartEndsAt(now: Date, latDeg: number, lonDeg: number): Date {
  const part = dayPartAt(now, latDeg, lonDeg);
  const STRIDE = 15 * 60_000;
  const LIMIT = now.getTime() + 26 * 3_600_000; // every chapter turns within a day, clock bands too
  let lo = now.getTime();
  let hi = lo;
  while (hi < LIMIT) {
    hi = Math.min(hi + STRIDE, LIMIT);
    if (dayPartAt(new Date(hi), latDeg, lonDeg) !== part) break;
    lo = hi;
  }
  while (hi - lo > 15_000) {
    const mid = (lo + hi) / 2;
    if (dayPartAt(new Date(mid), latDeg, lonDeg) === part) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

/**
 * Which chapter of the day an instant falls in, from the real sun:
 *
 *  - morning: civil dawn (−6°, rising side) → solar noon
 *  - midday:  solar noon → the sun dropping out of its high band
 *  - evening: → civil dusk (−6°)
 *  - night:   the rest
 *
 * The high band's floor is `min(6°, day's peak − 2°)`: in a subarctic winter the noon sun may
 * peak below +6°, and a fixed floor would erase midday entirely — clamping just under the
 * day's own culmination keeps a real (narrow) midday everywhere the sun rises at all. On
 * degenerate polar days the {@link clockDayPart} banding takes over.
 *
 * Note the deliberate non-coupling with {@link displayDateISO}: evening→night turns at civil
 * dusk (−6°), the Hijri date at sunset (−0.833°) — different instants, neither reads the other.
 */
export function dayPartAt(date: Date, latDeg: number, lonDeg: number): DayPart {
  const { alt, az } = sunHorizontal(date, latDeg, lonDeg);
  const { peak, trough } = solarCulminations(date, latDeg, lonDeg);
  if (peak < RISE_SET_ALT || trough > RISE_SET_ALT) return clockDayPart(date);
  // East of the meridian is az ∈ (0°, 180°) in the 0°=N frame, west is (180°, 360°) — true in
  // both hemispheres and the tropics, wherever the sun culminates. West ⇔ past solar noon.
  const postTransit = az > 180;
  const middayFloor = Math.min(6, peak - 2);
  if (!postTransit) return alt >= -6 ? 'morning' : 'night';
  if (alt >= middayFloor) return 'midday';
  return alt >= -6 ? 'evening' : 'night';
}

/**
 * The Gregorian ISO of the *displayed* Hijri day: tomorrow once the real sun has set (the
 * Islamic day begins at Maghrib), today until then — including the after-midnight hours,
 * which still belong to the Islamic day that began at the previous sunset. Where no sunset
 * exists (polar), the display simply follows the tracking day — honest degradation, no flip.
 */
export function displayDateISO(now: Date, latDeg: number, lonDeg: number): string {
  const today = todayLocalISO(now);
  const sunset = sunsetOn(today, latDeg, lonDeg);
  if (!sunset) return today;
  return now.getTime() >= sunset.getTime() ? addDaysISO(today, 1) : today;
}

export type SunCycle = { dayPart: DayPart; partEndsAt: Date; displayDateISO: string };

/** The derived day-cycle values for an instant — the one call the UI's clock hook needs.
 *  `partEndsAt` is a pure function of the chapter, so consumers comparing `dayPart` (+ the
 *  display day) for change-detection stay correct. */
export function sunCycleAt(now: Date, latDeg: number, lonDeg: number): SunCycle {
  return {
    dayPart: dayPartAt(now, latDeg, lonDeg),
    partEndsAt: dayPartEndsAt(now, latDeg, lonDeg),
    displayDateISO: displayDateISO(now, latDeg, lonDeg),
  };
}
