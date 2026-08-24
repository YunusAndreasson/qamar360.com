/**
 * When each lunar update goes out.
 *
 * Two ideas do all the work here.
 *
 * **The Hijri day turns at sunset.** The app already displays it that way
 * ({@link displayDateISO}), so an update that says "15 Muḥarram" has to arrive during the
 * night that *begins* 15 Muḥarram — the evening of the Gregorian day before the one whose
 * midnight carries it. For day 1 that lands exactly as the month begins, at the hour the
 * hilāl is findable low in the west.
 *
 * **The moon should be up when we mention it.** Inside that evening we sample the real moon's
 * altitude ({@link moonHorizontal}) and fire when it is highest. This is the only place the
 * ephemeris is consulted: it chooses the moment, never the words. If the moon never clears
 * {@link VISIBLE_ALT} in the window the update still goes out — the copy simply doesn't claim
 * anything about the sky (see {@link lunar-update.ts}).
 *
 * Pure and explicit about date/lat/lon, like {@link sun.ts} and {@link sky.ts}, so the whole
 * thing is testable without a device.
 */
import { addDaysISO, hijriMonthRange, localDate } from '@/lib/dates';
import { MILESTONE_DAYS, type MilestoneDay } from '@/lib/lunar-phase';
import { moonHorizontal } from '@/lib/sky';
import { displayDateISO, sunsetOn } from '@/lib/sun';

/** Minutes after sunset before the window opens — past dusk, and clear of the Maghrib hour. */
const WINDOW_OPENS_AFTER_SUNSET_MIN = 45;
/** How long the window stays open. */
const WINDOW_SPAN_MIN = 180;
/** Never fire before this local hour. A December sunset at 59°N is at 14:45, and an update that
 *  counts the nights left in a month has no business arriving mid-afternoon. */
const WINDOW_EARLIEST_HOUR = 18;
/** Never fire past this local hour, however late the sun sets. */
const WINDOW_LATEST_HOUR = 23;
/** Used where there is no sunset to anchor to — a polar day/night, or a sun that sets so late
 *  the window would fall outside the evening entirely. */
const FALLBACK_HOUR = 21;
/** How finely the window is searched for the moon's high point. */
const SAMPLE_STEP_MIN = 15;

/** Degrees of altitude below which the moon isn't meaningfully up, so the copy stays silent
 *  about it. Comfortably above the horizon haze, and above the ~0.5° of refraction slop. */
export const VISIBLE_ALT = 5;

const MINUTE_MS = 60_000;

export type LunarFire = {
  hijriDay: MilestoneDay;
  /**
   * The Gregorian day the milestone falls on — the day the app will be *displaying* when the
   * update arrives, which is not the day of {@link at} (a Hijri day turns at sunset, so the fire
   * is usually the evening before). Carried because it is the key a quarterly reading is
   * published under: the update and the reading it announces must be the same text.
   */
  dayISO: string;
  monthName: string;
  hijriYear: number;
  monthLength: number;
  /** The instant to fire. */
  at: Date;
  /** The real moon's altitude at {@link at}, in degrees. */
  moonAlt: number;
  /** True when this milestone belongs to a month whose progress cannot be known yet, so its
   *  copy must not quote a figure. Only ever set on the next month's day 1. */
  future: boolean;
};

function moonAltAt(date: Date, latDeg: number, lonDeg: number): number {
  try {
    return moonHorizontal(date, latDeg, lonDeg).alt;
  } catch {
    return -90; // no ephemeris answer — treat the moon as down rather than claim it is up
  }
}

/**
 * The moment to fire on the evening of `eveningISO` (a local `YYYY-MM-DD`), plus the moon's
 * altitude then. Always returns a time inside that evening — a moon that never rises only
 * costs the copy its "tonight" clause, never the notification.
 */
export function planFire(eveningISO: string, latDeg: number, lonDeg: number): { at: Date; moonAlt: number } {
  const earliest = localDate(eveningISO, WINDOW_EARLIEST_HOUR, 0);
  const latest = localDate(eveningISO, WINDOW_LATEST_HOUR, 0);
  const fallback = localDate(eveningISO, FALLBACK_HOUR, 0);
  const sunset = sunsetOn(eveningISO, latDeg, lonDeg);

  const afterSunset = sunset ? new Date(sunset.getTime() + WINDOW_OPENS_AFTER_SUNSET_MIN * MINUTE_MS) : fallback;
  // The floor only ever pushes later, so the window still opens after dusk wherever the sun
  // actually sets.
  let start = afterSunset.getTime() < earliest.getTime() ? earliest : afterSunset;
  // A high-latitude midsummer sunset can push the window past midnight; drop back to the
  // fixed hour rather than wake someone at 01:00.
  if (start.getTime() > latest.getTime()) start = fallback;

  const startMs = start.getTime();
  const endMs = Math.max(startMs, Math.min(startMs + WINDOW_SPAN_MIN * MINUTE_MS, latest.getTime()));

  let bestMs = startMs;
  let bestAlt = moonAltAt(start, latDeg, lonDeg);
  for (let ms = startMs + SAMPLE_STEP_MIN * MINUTE_MS; ms <= endMs; ms += SAMPLE_STEP_MIN * MINUTE_MS) {
    const alt = moonAltAt(new Date(ms), latDeg, lonDeg);
    if (alt > bestAlt) {
      bestAlt = alt;
      bestMs = ms;
    }
  }
  return { at: new Date(bestMs), moonAlt: bestAlt };
}

/**
 * The moment to fire so that the app, at that moment, is displaying `targetISO`'s Hijri date.
 *
 * Usually that is the evening *before* `targetISO`, because the Hijri day turns at sunset. But
 * two cases break that offset: a polar day with no sunset at all (the displayed date never
 * advances early), and a midsummer sunset so late that the window falls back to a fixed hour
 * *before* it. So rather than assume the offset, try the evening before and then the day
 * itself, and keep whichever one {@link displayDateISO} actually agrees with. `null` if
 * neither does — better to skip an update than to date it wrongly.
 */
function pickEvening(targetISO: string, latDeg: number, lonDeg: number): { at: Date; moonAlt: number } | null {
  for (const evening of [addDaysISO(targetISO, -1), targetISO]) {
    const planned = planFire(evening, latDeg, lonDeg);
    if (displayDateISO(planned.at, latDeg, lonDeg) === targetISO) return planned;
  }
  return null;
}

/**
 * Every update still ahead of `now`: this Hijri month's remaining milestones, plus the next
 * month's day 1.
 *
 * The next month stops at day 1 on purpose. A local notification freezes its text when it is
 * armed, and this month's degrees say nothing true about next month — but "a new month begins"
 * is true whatever happened in between, and it is exactly the right thing to reach a lapsed
 * user with. Days 8/15/22 of the next month are armed the first time the app is opened inside
 * it. Returns `[]` when the runtime has no Islamic calendar.
 */
export function planLunarFires(todayISO: string, latDeg: number, lonDeg: number, now = new Date()): LunarFire[] {
  const range = hijriMonthRange(todayISO);
  if (!range) return [];

  const fires: LunarFire[] = [];
  const push = (
    day: MilestoneDay,
    month: { start: string; length: number; monthName: string; year: number },
    future: boolean,
  ) => {
    const dayISO = addDaysISO(month.start, day - 1);
    const planned = pickEvening(dayISO, latDeg, lonDeg);
    if (!planned || planned.at.getTime() <= now.getTime()) return;
    fires.push({
      hijriDay: day,
      dayISO,
      monthName: month.monthName,
      hijriYear: month.year,
      monthLength: month.length,
      at: planned.at,
      moonAlt: planned.moonAlt,
      future,
    });
  };

  for (const day of MILESTONE_DAYS) push(day, range, false);

  const next = hijriMonthRange(addDaysISO(range.end, 1));
  if (next) push(1, next, true);

  return fires.sort((a, b) => a.at.getTime() - b.at.getTime());
}
