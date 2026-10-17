/**
 * Names for the shapes {@link moon.ts} draws.
 *
 * The app has always *rendered* phases without ever *naming* one — the Progress grid shows
 * thirty moons and lets them speak for themselves. A notification can't do that: it has one
 * line of text, so it has to say "full moon" out loud.
 *
 * The naming runs off the Hijri day of the month, exactly like {@link moonIllumination} — not
 * off the ephemeris. That is deliberate: the phase we name and the moon we draw must agree
 * with the ring on the Progress tab, and that ring is calendar-driven. The real sky is
 * consulted only to choose *when* to speak (see {@link lunar-schedule.ts}), never what to say.
 */
import { hijriMonthRange, hijriParts } from '@/lib/dates';
import { moonIllumination } from '@/lib/moon';

/** The eight phases of a lunar month, in cycle order from the new moon. */
export const LUNAR_PHASES = [
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
] as const;

export type LunarPhase = (typeof LUNAR_PHASES)[number];

const PHASE_LABELS: Record<LunarPhase, string> = {
  new: 'New moon',
  'waxing-crescent': 'Waxing crescent',
  'first-quarter': 'First quarter',
  'waxing-gibbous': 'Waxing gibbous',
  full: 'Full moon',
  'waning-gibbous': 'Waning gibbous',
  'last-quarter': 'Last quarter',
  'waning-crescent': 'Waning crescent',
};

/**
 * The four days a lunar update goes out — the quarters of the month.
 *
 * Chosen as Hijri days rather than astronomical instants so they land on the same grid the
 * Progress screen counts in. Both month lengths (29 and 30) put these days in the intended
 * quarter; `lunar-phase.test.ts` asserts exactly that, so changing a number here fails loudly.
 */
export const MILESTONE_DAYS = [1, 8, 15, 22] as const;

export type MilestoneDay = (typeof MILESTONE_DAYS)[number];

/** A month is 29 or 30 days; anything else is coerced so an asset key always resolves. */
export type MonthLength = 29 | 30;

export function asMonthLength(length: number): MonthLength {
  return length >= 30 ? 30 : 29;
}

/**
 * The phase for a day of the Hijri month.
 *
 * Named from the *cycle fraction*, not the illumination: illumination alone is ambiguous — a
 * half-lit moon is a first quarter on the way up and a last quarter on the way down, and the
 * two mean opposite things to someone tracking a month. Each phase owns an eighth of the cycle
 * centred on its own boundary, so `new` spans the last sixteenth and the first.
 */
export function phaseOf(
  dayOfMonth: number,
  monthLength: number,
): { phase: LunarPhase; label: string; illumination: number; waxing: boolean } {
  const p = monthLength > 0 ? (dayOfMonth - 1) / monthLength : 0;
  const wrapped = ((p % 1) + 1) % 1; // a day past the month's end wraps into the next cycle
  const index = Math.round(wrapped * LUNAR_PHASES.length) % LUNAR_PHASES.length;
  const phase = LUNAR_PHASES[index] as LunarPhase;
  const { illumination, waxing } = moonIllumination(dayOfMonth, monthLength);
  return { phase, label: PHASE_LABELS[phase], illumination, waxing };
}

/**
 * The moon on a calendar day, read off its Hijri date: the rule every moon in the app follows, so
 * any two drawn for the same day are the same moon. Without an Islamic calendar, a full moon, so a
 * day is never drawn blank.
 */
export function phaseOn(iso: string, hijriOffset?: number): ReturnType<typeof phaseOf> {
  return phaseOf(hijriParts(iso, hijriOffset)?.day ?? 15, hijriMonthRange(iso)?.length ?? 30);
}

/**
 * The bundled moon image for a milestone — see `scripts/gen-moons.mjs`, which renders one PNG
 * per key from the same geometry {@link moonPhasePath} uses.
 */
export function milestoneAssetKey(day: MilestoneDay, monthLength: number): string {
  return `d${String(day).padStart(2, '0')}-l${asMonthLength(monthLength)}`;
}

/** Every asset key that must exist, in a stable order — asserted against the bundled map in
 *  `moon.test.ts`, so a missing render fails the suite rather than the phone. `gen-moons.mjs` is
 *  `.mjs` and can't import this, so it mirrors the two constants by hand and says so. */
export const MILESTONE_ASSET_KEYS: readonly string[] = ([29, 30] as const).flatMap((length) =>
  MILESTONE_DAYS.map((day) => milestoneAssetKey(day, length)),
);
