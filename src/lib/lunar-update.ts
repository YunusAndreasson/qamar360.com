/**
 * What a lunar update says.
 *
 * Four notifications a month, one per quarter of the moon. Each one is a *temporal landmark* —
 * a cycle boundary, a first stretch, a midpoint, a run-in — which is the only claim being made
 * here. Nothing in this copy says the moon changes anybody's energy; it says where the month is
 * and where the user is in it, and lets the two sit beside each other.
 *
 * Four rules, each with a test:
 *
 * - **Degrees, never percent** ({@link toDegrees}) — the app's unit everywhere else.
 * - **Silence, not shame.** The pace clause appears only when the user is *ahead*, and a 0° month
 *   drops the figure entirely rather than print it on a lock screen. This is stricter than
 *   {@link celebrationCopy}, which does name a lower previous month — that copy appears inside a
 *   celebration the user has just earned; this one arrives unbidden.
 * - **One moon per body.** The title already names the phase, so nothing in the body describes
 *   the same moon a second time.
 * - **Never claim a sky we didn't check.** The "up now" clause needs a verified altitude
 *   ({@link VISIBLE_ALT}), which is why the schedule bothers to compute one.
 */
import { formatMeasure } from '@/lib/goals';
import { milestoneAssetKey } from '@/lib/lunar-phase';
import { type LunarFire, VISIBLE_ALT } from '@/lib/lunar-schedule';
import { type MonthProgress, toDegrees } from '@/lib/progress';
import { orbitDegrees } from '@/lib/progress-format';

/**
 * The one goal a new moon may speak for: the nearest horizon among the open ones, and what the
 * month it is opening asks of it. Only ever set on day 1 — see the `case 1` note below.
 */
export type GoalAsk = {
  title: string;
  /** This month's ask. Printed through `formatMeasure`, like every in-app surface — a four-figure
   *  ask reaching a lock screen as "1510" beside a goal screen saying "1,510" is one measure
   *  wearing two faces. */
  quota: number;
  unit: string;
};

export type LunarUpdateCopy = {
  title: string;
  body: string;
  /** Which bundled moon image to attach (iOS). See `scripts/gen-moons.mjs`. */
  assetKey: string;
};

/**
 * The sentence that carries the number, or `null` when there is no number worth carrying —
 * a month whose progress isn't knowable yet, or a still-empty one.
 */
function degreesSentence(month: MonthProgress | null): string | null {
  if (!month) return null;
  if (toDegrees(month.thisRate) === 0) return null; // nothing done yet: say nothing, rather than print a zero
  // The guarded figure the screens show, so a month a hair short of whole says 359°, never 360°.
  const degrees = orbitDegrees(month.thisRate);
  const ahead = month.hasPrevious && month.thisRate > month.previousRate;
  return ahead ? `You’re at ${degrees}°, ahead of last month.` : `You’re at ${degrees}°.`;
}

/** The clause about the real sky, or `null` when the moon isn't meaningfully above the horizon. */
function skySentence(fire: LunarFire): string | null {
  if (fire.moonAlt < VISIBLE_ALT) return null;
  // Day 1 is the hilāl — the thin crescent low after sunset that begins the month.
  return fire.hijriDay === 1 ? 'The first crescent is out.' : 'The moon is up now.';
}

/**
 * Title and body for one planned update.
 *
 * `month` is this Hijri month's progress, or `null` when it can't be known — always the case for
 * {@link LunarFire.future}, and also whenever the progress fetch failed, in which case the update
 * still goes out without a figure.
 */
export function lunarUpdateCopy(
  fire: LunarFire,
  month: MonthProgress | null,
  goalAsk: GoalAsk | null = null,
): LunarUpdateCopy {
  const { hijriDay, monthName, monthLength } = fire;
  // The new moon's goal ask displaces the month's degrees as well as the landmark's second half:
  // "replaces, not joins" has to hold against BOTH halves or the body grows to three sentences,
  // which is the one thing this copy has never allowed. The other milestones keep their figure.
  const degrees = fire.future || (hijriDay === 1 && goalAsk) ? null : degreesSentence(month);
  const sky = skySentence(fire);

  let title: string;
  let lead: string;

  switch (hijriDay) {
    case 1:
      // A fresh cycle is the strongest moment there is to restart something, and it is the one
      // line that stays true however long the app has gone unopened — so it is also the only
      // update armed a whole month ahead.
      //
      // It is also the only night a goal speaks. A temporal landmark is when an aspiration is
      // most likely to be taken up, the month's quota is recomputed at exactly this boundary, and
      // this is the update that reaches you whether or not you opened the app — so the ask
      // displaces the degrees rather than joining them. Three sentences on a lock screen is one
      // too many.
      title = `New moon · 1 ${monthName}`;
      lead = goalAsk
        ? `${monthName} begins. ${formatMeasure(goalAsk.quota)} ${goalAsk.unit} toward ${goalAsk.title}.`
        : `${monthName} begins. 360° ahead of you.`;
      break;
    case 8:
      // The title already names the phase; the body's job is the landmark, not a second
      // description of the same moon.
      title = `First quarter · 8 ${monthName}`;
      lead = `A quarter of ${monthName} is behind you.`;
      break;
    case 15:
      title = `Full moon · 15 ${monthName}`;
      lead = `The White Days, and ${monthName} half gone.`;
      break;
    case 22: {
      // Tonight counts: a Hijri day begins at sunset, so the night the update arrives is the
      // first of those left.
      const nights = Math.max(1, monthLength - 21);
      title = `Last quarter · 22 ${monthName}`;
      lead = `${nights} nights left in ${monthName}.`;
      break;
    }
  }

  return {
    title,
    body: [lead, degrees, sky].filter(Boolean).join(' '),
    assetKey: milestoneAssetKey(hijriDay, monthLength),
  };
}
