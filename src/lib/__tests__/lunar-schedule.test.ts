import { describe, expect, it } from '@jest/globals';

import { addDaysISO, hijriMonthRange, hijriParts, localDate } from '@/lib/dates';
import { MILESTONE_DAYS } from '@/lib/lunar-phase';
import { planFire, planLunarFires, VISIBLE_ALT } from '@/lib/lunar-schedule';
import { displayDateISO } from '@/lib/sun';

// The same span of the world sun.test.ts uses: the fallback city, a high-latitude capital, and
// a polar-circle city with both midnight sun and polar night.
const MECCA = { lat: 21.42, lon: 39.83 };
const STOCKHOLM = { lat: 59.333, lon: 18.05 };
const TROMSO = { lat: 69.65, lon: 18.96 };
const PLACES: [name: string, place: { lat: number; lon: number }][] = [
  ['Mecca', MECCA],
  ['Stockholm', STOCKHOLM],
  ['Tromsø', TROMSO],
];

// One date per month, so every seasonal shape of the evening is exercised — including a
// Scandinavian midsummer with no usable sunset window and a polar night with no sunset at all.
const THROUGH_THE_YEAR = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-10`);

/** The Islamic calendar is absent on a runtime without full ICU — skip rather than fail. */
const hasHijri = hijriParts('2026-07-25') !== null;

describe('planFire', () => {
  it.each(PLACES)('lands in the evening of the day it is asked for, in %s', (_name, place) => {
    for (const iso of THROUGH_THE_YEAR) {
      const { at, moonAlt } = planFire(iso, place.lat, place.lon);
      expect(Number.isFinite(moonAlt)).toBe(true);
      // Same calendar day it was planned for, never spilling past the ceiling into the small hours.
      expect(at.getFullYear()).toBe(localDate(iso).getFullYear());
      expect(at.getMonth()).toBe(localDate(iso).getMonth());
      expect(at.getDate()).toBe(localDate(iso).getDate());
      // Both ends of the window are local-clock bounds, so this holds at any latitude — a
      // December afternoon at 69°N is floored up, a midsummer midnight is capped down.
      expect(at.getHours()).toBeGreaterThanOrEqual(18);
      expect(at.getHours()).toBeLessThanOrEqual(23);
    }
  });

  it('picks the moment the moon is highest, not simply the window edge', () => {
    // Across a whole synodic month the moon's evening altitude sweeps from below the horizon to
    // well above it, so at least some evenings must resolve to a genuinely visible moon.
    const alts = Array.from({ length: 30 }, (_, i) =>
      planFire(addDaysISO('2026-07-01', i), MECCA.lat, MECCA.lon).moonAlt,
    );
    expect(Math.max(...alts)).toBeGreaterThan(VISIBLE_ALT);
    expect(Math.min(...alts)).toBeLessThan(VISIBLE_ALT);
  });
});

describe('planLunarFires', () => {
  it.each(PLACES)('dates every update to the Hijri day it names, in %s', (_name, place) => {
    if (!hasHijri) return;
    for (const iso of THROUGH_THE_YEAR) {
      const now = localDate(iso, 12, 0);
      for (const fire of planLunarFires(iso, place.lat, place.lon, now)) {
        // The claim the whole feature rests on: at the instant it fires, the date the app is
        // showing is the Hijri day the notification names.
        const shown = hijriParts(displayDateISO(fire.at, place.lat, place.lon));
        expect(shown?.day).toBe(fire.hijriDay);
        expect(shown?.monthName).toBe(fire.monthName);
        expect(shown?.year).toBe(fire.hijriYear);
      }
    }
  });

  it('only ever arms the future, in order', () => {
    if (!hasHijri) return;
    for (const iso of THROUGH_THE_YEAR) {
      const now = localDate(iso, 12, 0);
      const fires = planLunarFires(iso, STOCKHOLM.lat, STOCKHOLM.lon, now);
      for (const fire of fires) expect(fire.at.getTime()).toBeGreaterThan(now.getTime());
      const times = fires.map((f) => f.at.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });

  it('carries the rest of this month plus the next month’s opening, and no further', () => {
    if (!hasHijri) return;
    const range = hijriMonthRange('2026-07-25');
    expect(range).not.toBeNull();
    if (!range) return;

    // Stand on the morning of day 1. Day 1's own update fired the previous evening — the Hijri
    // day turns at sunset, so by daylight it is already behind us. Everything else is ahead,
    // and the horizon stops at the next month's opening.
    const first = range.start;
    const fires = planLunarFires(first, MECCA.lat, MECCA.lon, localDate(first, 6, 0));
    expect(fires.map((f) => f.hijriDay)).toEqual([...MILESTONE_DAYS.filter((d) => d !== 1), 1]);
    expect(fires.filter((f) => f.future)).toHaveLength(1);
    expect(fires.at(-1)?.monthName).not.toBe(range.monthName);
  });

  it('arms a month’s opening from the last day of the month before it', () => {
    if (!hasHijri) return;
    const range = hijriMonthRange('2026-07-25');
    if (!range) return;
    // Midday on the final day of a month: the only thing left is the new moon that begins the
    // next one, this evening — the lapsed-user nudge, and the one update armed a month out.
    const fires = planLunarFires(range.end, MECCA.lat, MECCA.lon, localDate(range.end, 12, 0));
    expect(fires.map((f) => f.hijriDay)).toEqual([1]);
    expect(fires[0]?.future).toBe(true);
    expect(fires[0]?.monthName).not.toBe(range.monthName);
  });

  it('drops milestones already passed', () => {
    if (!hasHijri) return;
    const range = hijriMonthRange('2026-07-25');
    if (!range) return;
    // Stand on day 16: days 1, 8 and 15 are behind us, only 22 and the next new moon remain.
    const day16 = addDaysISO(range.start, 15);
    const fires = planLunarFires(day16, MECCA.lat, MECCA.lon, localDate(day16, 12, 0));
    expect(fires.map((f) => f.hijriDay)).toEqual([22, 1]);
  });

  it('marks the next month as unknowable, so its copy quotes no figure', () => {
    if (!hasHijri) return;
    const fires = planLunarFires('2026-07-25', MECCA.lat, MECCA.lon, localDate('2026-07-25', 12, 0));
    const next = fires.filter((f) => f.future);
    expect(next).toHaveLength(1);
    expect(next[0]?.hijriDay).toBe(1);
    for (const fire of fires.filter((f) => !f.future)) expect(fire.hijriDay).not.toBe(1);
  });

  it('reports a plausible month length for every update', () => {
    if (!hasHijri) return;
    for (const iso of THROUGH_THE_YEAR) {
      for (const fire of planLunarFires(iso, MECCA.lat, MECCA.lon, localDate(iso, 12, 0))) {
        expect([29, 30]).toContain(fire.monthLength);
      }
    }
  });
});
