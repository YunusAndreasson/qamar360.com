import { describe, expect, it } from '@jest/globals';

import { addDaysISO } from '@/lib/dates';
import type { Noticing, Reading } from '@/lib/insights';
import { MILESTONE_DAYS, type MilestoneDay } from '@/lib/lunar-phase';
import type { LunarFire } from '@/lib/lunar-schedule';
import { VISIBLE_ALT } from '@/lib/lunar-schedule';
import { lunarUpdateCopy } from '@/lib/lunar-update';
import type { MonthProgress } from '@/lib/progress';

function fire(hijriDay: MilestoneDay, over: Partial<LunarFire> = {}): LunarFire {
  return {
    hijriDay,
    // Derived, not fixed: the four milestones fall a week apart, and a fixture that dated them
    // all to one day would let a reading published on one of them answer for all four.
    dayISO: addDaysISO('2026-07-19', hijriDay - 1),
    monthName: 'Muḥarram',
    hijriYear: 1448,
    monthLength: 30,
    at: new Date(2026, 6, 25, 20, 30),
    moonAlt: -20, // below the horizon by default: no update may claim a sky it wasn't given
    future: false,
    ...over,
  };
}

function month(over: Partial<MonthProgress> = {}): MonthProgress {
  return {
    monthName: 'Muḥarram',
    year: 1448,
    dayOfMonth: 15,
    monthLength: 30,
    thisRate: 0.475, // 171°
    paceRate: 0.5, // half the month has come due on day 15 of 30
    averageRate: 0.3,
    monthsAveraged: 1,
    previousRate: 0.3,
    hasPrevious: true,
    ...over,
  };
}

describe('lunarUpdateCopy', () => {
  it('names the phase and the Hijri date in every title, to one pattern', () => {
    expect(lunarUpdateCopy(fire(1), month()).title).toBe('New moon · 1 Muḥarram');
    expect(lunarUpdateCopy(fire(8), month()).title).toBe('First quarter · 8 Muḥarram');
    expect(lunarUpdateCopy(fire(15), month()).title).toBe('Full moon · 15 Muḥarram');
    expect(lunarUpdateCopy(fire(22), month()).title).toBe('Last quarter · 22 Muḥarram');
  });

  it('never describes the same moon twice inside one body', () => {
    // The title names the phase, so the body must not repeat it — "The moon is half lit. …
    // The moon is up now." reads like a stutter on a lock screen.
    for (const day of MILESTONE_DAYS) {
      const { body } = lunarUpdateCopy(fire(day, { moonAlt: 20 }), month());
      expect(body.match(/moon/gi)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('quotes the month’s degrees, never a percentage', () => {
    const { body } = lunarUpdateCopy(fire(15), month({ thisRate: 0.475 }));
    expect(body).toContain('171°');
    expect(body).not.toContain('%');
  });

  it('names the White Days at the full moon', () => {
    expect(lunarUpdateCopy(fire(15), month()).body).toContain('White Days');
  });

  it('counts the nights left from the month’s real length', () => {
    // A Hijri day begins at sunset, so the night the update lands is the first of those left:
    // day 22 through the month's end is 8 nights in a 29-day month, 9 in a 30-day one.
    expect(lunarUpdateCopy(fire(22, { monthLength: 29 }), month()).body).toContain('8 nights');
    expect(lunarUpdateCopy(fire(22, { monthLength: 30 }), month()).body).toContain('9 nights');
  });

  describe('silence, not shame', () => {
    it('says so when the user is ahead of last month', () => {
      const { body } = lunarUpdateCopy(fire(15), month({ thisRate: 0.5, previousRate: 0.3 }));
      expect(body).toContain('ahead of last month');
    });

    it('says nothing at all about last month when the user is behind', () => {
      const { body } = lunarUpdateCopy(fire(15), month({ thisRate: 0.2, previousRate: 0.6 }));
      expect(body).toContain('72°'); // the user's own figure still stands
      expect(body).not.toMatch(/last month/i);
      expect(body).not.toContain('216°'); // and last month's is never quoted back at them
    });

    it('drops the figure entirely rather than print a zero', () => {
      for (const day of MILESTONE_DAYS) {
        const { body } = lunarUpdateCopy(fire(day), month({ thisRate: 0 }));
        expect(body).not.toMatch(/You're at/); // no "you're at 0°" on anyone's lock screen
        expect(body).not.toMatch(/(^|[^36])0°/); // nor a bare zero anywhere (day 1's "360°" is fine)
        expect(body).toMatch(/\S/); // the landmark line still stands on its own
      }
    });

    it('never scolds, whatever the shape of the month', () => {
      for (const day of MILESTONE_DAYS) {
        for (const thisRate of [0, 0.1, 0.5, 1]) {
          const { body } = lunarUpdateCopy(fire(day), month({ thisRate, previousRate: 0.9 }));
          // "a quarter of the month is behind you" is the calendar, not a judgement — what may
          // never appear is a verdict on the user.
          expect(body).not.toMatch(/missed|slipp|fail|behind last|catch up|you only|fell/i);
        }
      }
    });
  });

  describe('the sky clause', () => {
    it('stays silent when the moon is below the horizon', () => {
      const { body } = lunarUpdateCopy(fire(15, { moonAlt: -10 }), month());
      expect(body).not.toMatch(/up now|crescent is out/);
    });

    it('speaks only once the altitude was actually verified', () => {
      expect(lunarUpdateCopy(fire(15, { moonAlt: VISIBLE_ALT - 1 }), month()).body).not.toMatch(/up now/);
      expect(lunarUpdateCopy(fire(15, { moonAlt: VISIBLE_ALT + 1 }), month()).body).toContain('The moon is up now.');
    });

    it('calls day one’s moon a crescent, because that is what a hilāl is', () => {
      const { body } = lunarUpdateCopy(fire(1, { moonAlt: 12 }), month());
      expect(body).toContain('The first crescent is out.');
      expect(body).not.toContain('The moon is up now.');
    });
  });

  describe('a month whose progress cannot be known', () => {
    it('quotes no figure for a future month', () => {
      const { body } = lunarUpdateCopy(fire(1, { future: true }), month({ thisRate: 0.9 }));
      expect(body).toContain('360°'); // the one degree figure true of any month about to begin
      expect(body).not.toContain('324°'); // this month's 0.9 must not leak into next month's copy
      expect(body).not.toMatch(/You're at/);
    });

    it('still produces a usable update when progress failed to load', () => {
      for (const day of MILESTONE_DAYS) {
        const { title, body } = lunarUpdateCopy(fire(day), null);
        expect(title).toMatch(/\S/);
        expect(body).toMatch(/\S/);
        expect(body).not.toMatch(/undefined|NaN|null/);
      }
    });
  });

  it('points at a moon image that exists for this milestone and month length', () => {
    expect(lunarUpdateCopy(fire(15, { monthLength: 29 }), month()).assetKey).toBe('d15-l29');
    expect(lunarUpdateCopy(fire(1, { monthLength: 30 }), month()).assetKey).toBe('d01-l30');
  });
});

// ── The reading an update carries ───────────────────────────────────────────
// A milestone is also the moment a quarterly reading is published, and the two must be one text.
// These pin the seam: which reading is picked, when it is allowed to speak, and what happens in
// each of the ways it can be absent.

const QUARTER_SPAN = {
  startISO: '2026-07-19',
  endISO: '2026-07-25',
  milestone: 1 as const,
  monthName: 'Muḥarram',
  monthNumber: 1,
  year: 1448,
  days: 7,
};

function reading(over: Partial<Reading> = {}, lead: Partial<Noticing> = {}): Reading {
  const tally = {
    span: QUARTER_SPAN,
    rate: 0.6,
    earned: 4.2,
    possible: 7,
    sealedDays: 4,
    longestRun: { days: 3, startISO: '2026-07-19', endISO: '2026-07-21' },
    byHabit: new Map<string, { possible: number; earned: number }>(),
    byWeekday: Array.from({ length: 7 }, () => ({ possible: 1, earned: 0.6 })),
  };
  return {
    id: '1448-1-1',
    span: QUARTER_SPAN,
    phase: 'first-quarter',
    phaseLabel: 'First quarter',
    illumination: 0.5,
    waxing: true,
    publishedISO: '2026-07-26', // the day-8 fire's own day — 1 Muḥarram + 7
    quarter: tally,
    previous: null,
    lead: {
      kind: 'pace',
      headline: 'Ahead of last quarter — 216° against 171°.',
      body: 'A gain of 45° — about 1 day more of the quarter kept.',
      salience: 0.5,
      notifiable: true,
      ...lead,
    },
    also: [],
    closed: true,
    ...over,
  };
}

describe('the reading an update carries', () => {
  it("speaks the reading's headline instead of the landmark and the bare figure", () => {
    const copy = lunarUpdateCopy(fire(8), month(), [reading()]);
    expect(copy.body).toBe('Ahead of last quarter — 216° against 171°.');
    // Both of the things it replaced are gone — a lock screen gets one claim, not three.
    expect(copy.body).not.toMatch(/A quarter of Muḥarram is behind you/);
    expect(copy.body).not.toMatch(/You're at/);
  });

  it('still names the phase and the date in the title, so nothing downstream shifts', () => {
    // `settings/index.tsx` renders the next update's title as its footer, off this same generator.
    expect(lunarUpdateCopy(fire(8), month(), [reading()]).title).toBe('First quarter · 8 Muḥarram');
    expect(lunarUpdateCopy(fire(8), null).title).toBe('First quarter · 8 Muḥarram');
  });

  it('carries the reading id, so the tap opens that reading rather than the feed', () => {
    expect(lunarUpdateCopy(fire(8), month(), [reading()]).readingId).toBe('1448-1-1');
  });

  it('keeps the sky clause, which is about tonight and not about the record', () => {
    const copy = lunarUpdateCopy(fire(8, { moonAlt: VISIBLE_ALT + 1 }), month(), [reading()]);
    expect(copy.body).toBe('Ahead of last quarter — 216° against 171°. The moon is up now.');
  });

  it('picks the reading published on ITS day, never merely the newest', () => {
    const elsewhere = reading({ id: '1448-1-22', publishedISO: '2026-08-16' });
    const copy = lunarUpdateCopy(fire(8), month(), [elsewhere]);
    expect(copy.readingId).toBeUndefined();
    expect(copy.body).toMatch(/A quarter of Muḥarram is behind you/);
  });

  describe('falls back to the landmark, and says nothing it should not', () => {
    it('when the reading names a slip', () => {
      const held = reading({}, { kind: 'slipper', headline: 'Witr is the one asking for you.', notifiable: false });
      const copy = lunarUpdateCopy(fire(8), month(), [held]);
      expect(copy.body).not.toMatch(/asking for you/);
      expect(copy.readingId).toBeUndefined();
      expect(copy.body).toMatch(/A quarter of Muḥarram is behind you/);
    });

    it('when the quarter has not begun, so no reading exists for that day', () => {
      const copy = lunarUpdateCopy(fire(15), month(), [reading()]);
      expect(copy.body).toMatch(/The White Days/);
      expect(copy.readingId).toBeUndefined();
    });

    it('when the record could not be read at all', () => {
      const copy = lunarUpdateCopy(fire(8), null, []);
      expect(copy.body).toBe('A quarter of Muḥarram is behind you.');
      expect(copy.body).not.toMatch(/undefined|NaN|null/);
    });
  });

  it('never lets a reading put a second moon in the body', () => {
    for (const day of MILESTONE_DAYS) {
      const copy = lunarUpdateCopy(fire(day, { moonAlt: VISIBLE_ALT + 1 }), month(), [
        reading({ publishedISO: '2026-07-26' }),
      ]);
      expect(copy.body.match(/moon/gi)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });
});
