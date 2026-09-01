/**
 * What a lunar update says.
 *
 * Four notifications a month, one per quarter of the moon. Each one is a *temporal landmark* —
 * a cycle boundary, a first stretch, a midpoint, a run-in — which is the only claim being made
 * here. Nothing in this copy says the moon changes anybody's energy; it says where the month is
 * and where the user is in it, and lets the two sit beside each other.
 *
 * **The update is the reading's first line.** Every milestone is also the moment a quarterly
 * reading is published ({@link import('./insights').computeReadings}), and where one exists the
 * update carries its headline and deep-links to it. One text, two surfaces — rather than a
 * notification and a screen saying two different things about the same night.
 *
 * Four rules, each with a test:
 *
 * - **Degrees, never percent** ({@link toDegrees}) — the app's unit everywhere else.
 * - **Silence, not shame.** The pace clause appears only when the user is *ahead*, a 0° reading
 *   drops the figure entirely rather than print it on a lock screen, and a reading whose headline
 *   names a slip is `notifiable: false` and never reaches here. This is stricter than
 *   {@link celebrationCopy}, which does name a lower previous month — that copy appears inside a
 *   celebration the user has just earned; this one arrives unbidden.
 * - **One moon per body.** The title already names the phase, so nothing in the body describes
 *   the same moon a second time — which is also why a reading's copy never says "moon".
 * - **Never claim a sky we didn't check.** The "up now" clause needs a verified altitude
 *   ({@link VISIBLE_ALT}), which is why the schedule bothers to compute one.
 */
import type { Reading } from '@/lib/insights';
import { milestoneAssetKey } from '@/lib/lunar-phase';
import { type LunarFire, VISIBLE_ALT } from '@/lib/lunar-schedule';
import { type MonthProgress, toDegrees } from '@/lib/progress';

/**
 * The one goal a new moon may speak for: the nearest horizon among the open ones, and what the
 * month it is opening asks of it. Only ever set on day 1 — see the `case 1` note below.
 */
export type GoalAsk = {
  title: string;
  /** This month's ask, already rounded — the copy prints it as given. */
  quota: number;
  unit: string;
};

export type LunarUpdateCopy = {
  title: string;
  body: string;
  /** Which bundled moon image to attach (iOS). See `scripts/gen-moons.mjs`. */
  assetKey: string;
  /** The reading this update announces, when it carries one — the tap opens it directly. */
  readingId?: string;
};

/**
 * The sentence that carries the number, or `null` when there is no number worth carrying —
 * a month whose progress isn't knowable yet, or a still-empty one.
 */
function degreesSentence(month: MonthProgress | null): string | null {
  if (!month) return null;
  const degrees = toDegrees(month.thisRate);
  if (degrees === 0) return null; // nothing done yet: say nothing, rather than print a zero
  const ahead = month.hasPrevious && month.thisRate > month.previousRate;
  return ahead ? `You're at ${degrees}° — ahead of last month.` : `You're at ${degrees}°.`;
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
 *
 * `readings` are the quarterly readings, newest first. The one published on this fire's day (if
 * any) supplies the body; otherwise the calendrical lead and the month's degrees do, exactly as
 * before. A reading is *absent* rather than empty in three real cases — the quarter hasn't begun
 * (a milestone armed weeks ahead), the record hasn't opened yet, or the fetch failed — and one is
 * *held back* when it earned nothing or its headline names a slip. All four fall through to the
 * same landmark sentence, which is true whatever happened.
 */
export function lunarUpdateCopy(
  fire: LunarFire,
  month: MonthProgress | null,
  readings: readonly Reading[] = [],
  goalAsk: GoalAsk | null = null,
): LunarUpdateCopy {
  const { hijriDay, monthName, monthLength } = fire;
  const reading = readings.find((r) => r.publishedISO === fire.dayISO);
  const notice = reading && reading.lead.notifiable ? reading : null;
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
      // too many, which is the same rule a quarterly reading is admitted under.
      title = `New moon · 1 ${monthName}`;
      lead = goalAsk
        ? `${monthName} begins. ${goalAsk.quota} ${goalAsk.unit} toward ${goalAsk.title}.`
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
    // The reading REPLACES the landmark and the bare figure rather than joining them: its
    // headline already says where the quarter went, and three sentences on a lock screen is one
    // too many. The sky clause survives either way — it is about tonight, not about the record.
    body: (notice ? [notice.lead.headline, sky] : [lead, degrees, sky]).filter(Boolean).join(' '),
    assetKey: milestoneAssetKey(hijriDay, monthLength),
    ...(notice ? { readingId: notice.id } : null),
  };
}
