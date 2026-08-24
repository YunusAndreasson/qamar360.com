import { describe, expect, it } from '@jest/globals';

import { addDaysISO, hijriMonthRange, hijriParts } from '@/lib/dates';
import { computeReadings, latestReadingId, NOTICING_KINDS, type Noticing, type Reading } from '@/lib/insights';
import { MILESTONE_DAYS } from '@/lib/lunar-phase';
import { creditOnDay, toDegrees, type CompletionRow, type ProgressHabit } from '@/lib/progress';

// ── Fixtures ────────────────────────────────────────────────────────────────
// Expectations are derived from *intended* behaviour, never copied from current output — so a
// test going red means the code is wrong, not the test. The real Umm al-Qura calendar is used
// throughout (there is a sanity guard below), because a quarter IS a Hijri span and mocking the
// calendar would only test the mock.

type NamedHabit = ProgressHabit & { name?: string | null };

/** A habit due every weekday, existing for all of history. */
const daily = (id: string, name = id): NamedHabit => ({
  id,
  name,
  created_at: null, // null = creation unknown → never filtered out by `scheduledOn`
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  hijri_schedule: null,
});

/** A habit due every weekday, created on a known day — the newcomer path. */
const born = (id: string, createdISO: string, name = id): NamedHabit => ({
  ...daily(id, name),
  created_at: `${createdISO}T12:00:00.000Z`,
});

/** A White-Days habit — exercises the Hijri-schedule path and turns off weekday readings. */
const whiteDays = (id: string, name = id): NamedHabit => ({
  id,
  name,
  created_at: null,
  schedule_days: [],
  hijri_schedule: { monthDays: [13, 14, 15] },
});

const done = (habit_id: string, completed_at: string): CompletionRow => ({ habit_id, completed_at, status: 'done', count: null });
const skip = (habit_id: string, completed_at: string): CompletionRow => ({ habit_id, completed_at, status: 'skipped', count: null });

/** Rows marking `ids` done on every day of an inclusive span. */
function doneAcross(ids: string[], startISO: string, endISO: string): CompletionRow[] {
  const rows: CompletionRow[] = [];
  for (let day = startISO; day <= endISO; day = addDaysISO(day, 1)) for (const id of ids) rows.push(done(id, day));
  return rows;
}

function readings(habits: NamedHabit[], completions: CompletionRow[], today: string): Reading[] {
  return computeReadings(habits, creditOnDay(completions), today);
}

/** The Hijri shape of a day, read from the already-tested calendar helpers (no hardcoded 29/30). */
function monthShape(iso: string) {
  const range = hijriMonthRange(iso);
  if (!range) throw new Error('Islamic calendar unavailable in this test environment');
  return range;
}

/** The Gregorian day a Hijri day-of-month falls on, for the month containing `iso`. */
const dayOfMonth = (iso: string, day: number): string => addDaysISO(monthShape(iso).start, day - 1);

/**
 * A deterministic spread of anchor days: the 1st of N consecutive Hijri months from a base
 * date. Hits every month boundary and both 29- and 30-day lengths without hardcoding.
 */
function monthStarts(baseISO: string, months: number): string[] {
  const out: string[] = [];
  let cursor = monthShape(baseISO).start;
  for (let m = 0; m < months; m += 1) {
    out.push(cursor);
    cursor = addDaysISO(monthShape(cursor).end, 1);
  }
  return out;
}

const SWEEP = monthStarts('2026-01-01', 13); // a full Hijri year + both month lengths

const all = (r: Reading): Noticing[] => [r.lead, ...r.also];

/** The reading for one named quarter of the month containing `anchor`. The feed spans a Hijri
 *  year, so matching on the milestone alone would pick whichever month came last. */
function quarterOf(feed: Reading[], anchor: string, milestone: number): Reading {
  const startISO = dayOfMonth(anchor, milestone);
  const found = feed.find((r) => r.span.startISO === startISO);
  if (!found) throw new Error(`no reading for quarter ${milestone} of the month at ${anchor}`);
  return found;
}

describe('computeReadings', () => {
  it('sanity: the test runtime has the Umm al-Qura calendar', () => {
    expect(hijriMonthRange('2026-06-15')).not.toBeNull();
  });

  // ── The quarter grid ──────────────────────────────────────────────────────

  describe('the four quarters partition the Hijri month exactly', () => {
    it.each(SWEEP)('%s', (start) => {
      const { end, length } = monthShape(start);
      // A day late in the FOLLOWING month, so every quarter of this one has closed.
      const today = addDaysISO(end, 25);
      const spans = readings([daily('a')], doneAcross(['a'], start, end), today)
        .map((r) => r.span)
        .filter((s) => s.startISO >= start && s.endISO <= end)
        .sort((x, y) => x.startISO.localeCompare(y.startISO));

      expect(spans.map((s) => s.milestone)).toEqual([...MILESTONE_DAYS]);
      // Contiguous, gapless, and covering the month end to end.
      expect(spans[0]!.startISO).toBe(start);
      expect(spans[spans.length - 1]!.endISO).toBe(end);
      for (let i = 1; i < spans.length; i += 1) expect(spans[i]!.startISO).toBe(addDaysISO(spans[i - 1]!.endISO, 1));
      expect(spans.reduce((n, s) => n + s.days, 0)).toBe(length);
      // The first three are always a week; only the last carries the month's odd days.
      expect(spans.slice(0, 3).map((s) => s.days)).toEqual([7, 7, 7]);
      expect(spans[3]!.days).toBe(length - 21);
    });
  });

  it('publishes a reading on the milestone that closes its quarter', () => {
    const start = monthShape('2026-06-15').start;
    const { end } = monthShape(start);
    const today = addDaysISO(end, 25);
    for (const r of readings([daily('a')], doneAcross(['a'], start, end), today)) {
      // The day after the quarter's last is a milestone — that is what makes the reading and the
      // notification announcing it land on the same moon.
      expect(MILESTONE_DAYS).toContain(hijriParts(r.publishedISO)!.day);
      expect(r.publishedISO).toBe(addDaysISO(r.span.endISO, 1));
    }
  });

  it("the day-1 reading is about the previous month's last quarter", () => {
    const start = monthShape('2026-06-15').start;
    const { end } = monthShape(start);
    const next = addDaysISO(end, 1);
    const today = addDaysISO(next, 10); // into the next month, past its own first milestone
    const feed = readings([daily('a')], doneAcross(['a'], start, today), today);

    const lastOfMonth = feed.find((r) => r.span.milestone === 22 && r.span.endISO === end);
    expect(lastOfMonth).toBeDefined();
    expect(lastOfMonth!.publishedISO).toBe(next); // day 1 of the following month
    expect(lastOfMonth!.phaseLabel).toBe('New moon');
  });

  it('the newest reading is first, and a quarter still being lived is not closed', () => {
    const start = monthShape('2026-06-15').start;
    const today = dayOfMonth(start, 17); // inside the third quarter (15–21)
    const feed = readings([daily('a')], doneAcross(['a'], addDaysISO(start, -60), today), today);

    expect(feed.map((r) => r.span.startISO)).toEqual([...feed.map((r) => r.span.startISO)].sort().reverse());
    expect(feed[0]!.closed).toBe(false);
    expect(feed[0]!.span.milestone).toBe(15);
    expect(feed.slice(1).every((r) => r.closed)).toBe(true);
  });

  // ── The rate ──────────────────────────────────────────────────────────────

  it('measures a quarter against what the WHOLE quarter asks, so a still-open one can be baked early', () => {
    const start = monthShape('2026-06-15').start;
    // Two days into the first quarter, both kept. Seven days are due across it.
    const today = addDaysISO(start, 1);
    const feed = readings([daily('a')], doneAcross(['a'], start, today), today);
    const open = feed[0]!;

    expect(open.closed).toBe(false);
    expect(open.quarter.possible).toBe(7); // the days still ahead already ask
    expect(open.quarter.earned).toBe(2);
    expect(open.quarter.rate).toBeCloseTo(2 / 7, 10);
  });

  it('leaves an excused day out of both sides of the rate', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(monthShape(start).end, 25);

    const kept = doneAcross(['a'], start, addDaysISO(start, 4)); // 5 of 7 days
    const excused = [skip('a', addDaysISO(start, 5)), skip('a', addDaysISO(start, 6))];
    const feed = readings([daily('a')], [...kept, ...excused], today);
    const first = quarterOf(feed, start, 1);

    // Two excused days leave the quarter entirely: 5 of 5, a full orbit — never 5 of 7.
    expect(first.quarter.possible).toBe(5);
    expect(first.quarter.rate).toBe(1);
  });

  it('counts a day as sealed only when every act still in play was kept', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(monthShape(start).end, 25);
    const rows = [
      ...doneAcross(['a', 'b'], start, addDaysISO(start, 2)), // 3 whole days
      done('a', addDaysISO(start, 3)), // half a day — not sealed
      skip('b', addDaysISO(start, 4)),
      done('a', addDaysISO(start, 4)), // the other act excused → the day still seals
    ];
    const first = quarterOf(readings([daily('a'), daily('b')], rows, today), start, 1);

    expect(first.quarter.sealedDays).toBe(4);
    expect(first.quarter.longestRun).toEqual({ days: 3, startISO: start, endISO: addDaysISO(start, 2) });
  });

  // ── What a reading says ───────────────────────────────────────────────────

  it('says so plainly when there is nothing yet to compare against', () => {
    const start = monthShape('2026-06-15').start;
    const today = dayOfMonth(start, 10); // the first quarter has closed, and only it
    const feed = readings([born('a', start)], doneAcross(['a'], start, addDaysISO(start, 6)), today);
    const first = feed[feed.length - 1]!;

    expect(first.previous).toBeNull();
    expect(first.lead.kind).toBe('first');
    // A first reading has no last quarter, so it must not imply one.
    expect(first.lead.headline + first.lead.body).not.toMatch(/last quarter/i);
  });

  it('carries the quarter-on-quarter comparison whether or not it leads', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(monthShape(start).end, 25);
    // Quarter 1 kept in full, quarter 2 barely — the comparison exists on both readings.
    const rows = [...doneAcross(['a'], start, addDaysISO(start, 6)), done('a', addDaysISO(start, 7))];
    const feed = readings([daily('a')], rows, today);
    const second = quarterOf(feed, start, 8);

    expect(second.previous).not.toBeNull();
    expect(toDegrees(second.previous!.rate)).toBe(360);
    expect(toDegrees(second.quarter.rate)).toBe(toDegrees(1 / 7));
  });

  it('calls a move inside half a day of the quarter what it is — the same, not better', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(monthShape(start).end, 25);
    // 4 of 7 days in the first quarter, 4 of 7 in the second: identical rates.
    const rows = [
      ...doneAcross(['a'], start, addDaysISO(start, 3)),
      ...doneAcross(['a'], addDaysISO(start, 7), addDaysISO(start, 10)),
    ];
    const feed = readings([daily('a')], rows, today);
    const second = quarterOf(feed, start, 8);

    expect(all(second).map((n) => n.kind)).toContain('steady');
    expect(all(second).map((n) => n.kind)).not.toContain('pace');
  });

  it('does not call two empty quarters "about the same" — parity of nothing is not parity of effort', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(monthShape(start).end, 25);
    // The record exists (the first quarter was kept) and then stops entirely.
    const feed = readings([daily('a')], doneAcross(['a'], start, addDaysISO(start, 6)), today);
    const third = quarterOf(feed, start, 15);

    expect(toDegrees(third.quarter.rate)).toBe(0);
    expect(all(third).map((n) => n.kind)).toContain('quiet');
    expect(all(third).map((n) => n.kind)).not.toContain('steady');
    expect(`${third.lead.headline} ${third.lead.body}`).not.toMatch(/same as last/i);
  });

  it('names the act that gained the most ground', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(monthShape(start).end, 25);
    const q2 = addDaysISO(start, 7);
    const rows = [
      // 'steady' holds level; 'climber' goes from one day to all seven.
      ...doneAcross(['steady'], start, addDaysISO(start, 3)),
      ...doneAcross(['steady'], q2, addDaysISO(q2, 3)),
      done('climber', start),
      ...doneAcross(['climber'], q2, addDaysISO(q2, 6)),
    ];
    const feed = readings([daily('steady', 'Steady act'), daily('climber', 'Fajr adhkār')], rows, today);
    const second = quarterOf(feed, start, 8);
    const riser = all(second).find((n) => n.kind === 'riser');

    expect(riser).toBeDefined();
    expect(riser!.headline).toContain('Fajr adhkār');
  });

  it('names an act kept on every day it asked for', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(monthShape(start).end, 25);
    const feed = readings([daily('a', 'Qurʾān')], doneAcross(['a'], start, addDaysISO(start, 6)), today);
    const first = quarterOf(feed, start, 1);
    const unbroken = all(first).find((n) => n.kind === 'unbroken');

    expect(unbroken).toBeDefined();
    expect(unbroken!.headline).toContain('Qurʾān');
  });

  it('notices something begun inside the quarter', () => {
    const start = monthShape('2026-06-15').start;
    const today = addDaysISO(monthShape(start).end, 25);
    const q2 = addDaysISO(start, 7);
    const rows = [...doneAcross(['old'], start, addDaysISO(start, 20)), ...doneAcross(['new'], q2, addDaysISO(q2, 5))];
    const feed = readings([daily('old', 'Old act'), born('new', q2, 'Duʿāʾ after ʿAṣr')], rows, today);
    const second = quarterOf(feed, start, 8);
    const newcomer = all(second).find((n) => n.kind === 'newcomer');

    expect(newcomer).toBeDefined();
    expect(newcomer!.headline).toContain('Duʿāʾ after ʿAṣr');
  });

  it('has no weekday reading for a record made only of Hijri-scheduled acts', () => {
    const start = monthShape('2026-01-01').start;
    const today = addDaysISO(start, 300);
    const feed = readings([whiteDays('w')], doneAcross(['w'], start, today), today);

    expect(feed.flatMap(all).map((n) => n.kind)).not.toContain('weekday');
  });

  // ── Variety ───────────────────────────────────────────────────────────────

  it('never repeats a headline within three readings while another is available', () => {
    const start = monthShape('2026-01-01').start;
    const today = addDaysISO(start, 320);
    // A record with real texture: one act steadily kept, one wandering.
    const rows: CompletionRow[] = [];
    let day = start;
    for (let i = 0; day <= today; i += 1, day = addDaysISO(day, 1)) {
      rows.push(done('steady', day));
      if (i % 5 !== 0) rows.push(done('wander', day));
    }
    const feed = readings([daily('steady', 'Fajr'), daily('wander', 'Witr')], rows, today).filter((r) => r.closed);

    expect(feed.length).toBeGreaterThan(8);
    for (let i = 0; i < feed.length; i += 1) {
      const here = feed[i]!;
      const recent = feed.slice(i + 1, i + 4).map((r) => r.lead.kind); // the feed runs newest first
      if (!recent.includes(here.lead.kind)) continue;
      // A repeat is only allowed where nothing FRESH was on offer. `also` is ranked by the same
      // rule, fresh first — so if the lead was held back, everything under it must be too.
      for (const n of here.also) expect(recent).toContain(n.kind);
    }

    // And the promise this is all for: a year of readings does not say one thing over and over.
    expect(new Set(feed.map((r) => r.lead.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it('keeps a fact held back from the headline, rather than dropping it', () => {
    const start = monthShape('2026-01-01').start;
    const today = addDaysISO(start, 320);
    const rows: CompletionRow[] = [];
    for (let day = start; day <= today; day = addDaysISO(day, 1)) rows.push(done('a', day));
    const feed = readings([daily('a', 'Fajr')], rows, today).filter((r) => r.closed);

    // Every quarter of this record was kept in full, so every reading must SAY so somewhere —
    // the rotation moves a claim out of the headline, it never silences one.
    expect(feed.length).toBeGreaterThan(8);
    for (const r of feed.slice(0, 8)) {
      expect(all(r).map((n) => n.kind)).toContain('unbroken');
    }
  });

  it('is deterministic — the same record always writes the same feed', () => {
    const start = monthShape('2026-01-01').start;
    const today = addDaysISO(start, 200);
    const habits = [daily('a', 'Fajr'), daily('b', 'Witr')];
    const rows = doneAcross(['a'], start, addDaysISO(start, 120));

    const once = readings(habits, rows, today);
    const twice = readings([...habits].reverse(), [...rows].reverse(), today);
    expect(twice.map((r) => `${r.id}:${r.lead.kind}:${r.lead.headline}`)).toEqual(
      once.map((r) => `${r.id}:${r.lead.kind}:${r.lead.headline}`),
    );
  });

  it('gives every reading a stable, route-safe id', () => {
    const start = monthShape('2026-01-01').start;
    const today = addDaysISO(start, 200);
    const feed = readings([daily('a')], doneAcross(['a'], start, today), today);

    expect(new Set(feed.map((r) => r.id)).size).toBe(feed.length);
    for (const r of feed) expect(r.id).toMatch(/^\d+-\d+-(1|8|15|22)$/);
  });

  // ── Silence, not shame ────────────────────────────────────────────────────

  describe('what may reach a lock screen', () => {
    const start = monthShape('2026-01-01').start;
    const today = addDaysISO(start, 320);

    /** A record that rises, plateaus and falls — so every detector gets a turn. */
    function texturedFeed(): Reading[] {
      const rows: CompletionRow[] = [];
      let day = start;
      for (let i = 0; day <= today; i += 1, day = addDaysISO(day, 1)) {
        // Rise for the first third, hold for the second, fall away through the last.
        const keep = i < 100 ? i % 4 !== 0 : i < 200 ? i % 2 === 0 : i % 6 === 0;
        if (keep) rows.push(done('a', day));
        if (i % 3 === 0) rows.push(done('b', day));
      }
      return readings([daily('a', 'Fajr'), daily('b', 'Witr')], rows, today);
    }

    it('never pushes a scold', () => {
      for (const r of texturedFeed()) {
        for (const n of all(r).filter((x) => x.notifiable)) {
          expect(`${n.headline} ${n.body}`).not.toMatch(/missed|slipp|fail|behind last|catch up|you only|fell/i);
        }
      }
    });

    it('never pushes a fall, and always keeps one in the app', () => {
      const feed = texturedFeed();
      const slips = feed.flatMap(all).filter((n) => n.kind === 'slipper' || (n.kind === 'pace' && /quieter/.test(n.headline)));
      expect(slips.length).toBeGreaterThan(0); // the record really does fall away
      expect(slips.every((n) => !n.notifiable)).toBe(true);
    });

    it('says nothing pushable about a quarter that earned nothing', () => {
      const today2 = addDaysISO(monthShape(start).end, 25);
      // The first quarter kept, the second empty.
      const feed = readings([daily('a')], doneAcross(['a'], start, addDaysISO(start, 6)), today2);
      const empty = quarterOf(feed, start, 8);

      expect(toDegrees(empty.quarter.rate)).toBe(0);
      expect(all(empty).every((n) => !n.notifiable)).toBe(true);
    });

    it("never describes the moon — the notification's title already has", () => {
      for (const r of texturedFeed()) for (const n of all(r)) expect(`${n.headline} ${n.body}`).not.toMatch(/moon/i);
    });

    it('quotes no undefined, NaN or null', () => {
      for (const r of texturedFeed()) {
        for (const n of all(r)) expect(`${n.headline} ${n.body}`).not.toMatch(/undefined|NaN|null|\[object/);
        expect(r.lead.headline.trim()).not.toBe('');
      }
    });
  });

  // ── Degenerate records ────────────────────────────────────────────────────

  it('writes nothing before anything was ever scheduled', () => {
    expect(readings([], [], '2026-06-15')).toEqual([]);
  });

  it('writes nothing for quarters that pre-date the record', () => {
    const start = monthShape('2026-06-15').start;
    const openedOn = dayOfMonth(start, 15); // the record opens mid-month
    const today = addDaysISO(monthShape(start).end, 25);
    const feed = readings([born('a', openedOn)], doneAcross(['a'], openedOn, today), today);

    expect(feed.every((r) => r.span.endISO >= openedOn)).toBe(true);
  });

  it('every noticing declares a kind the module knows', () => {
    const start = monthShape('2026-01-01').start;
    const today = addDaysISO(start, 320);
    const feed = readings([daily('a'), daily('b')], doneAcross(['a'], start, addDaysISO(start, 150)), today);
    for (const r of feed) for (const n of all(r)) expect(NOTICING_KINDS).toContain(n.kind);
  });
});

// ── The unread mark ─────────────────────────────────────────────────────────
// The tab bar's dot asks "has a quarter closed since I last looked?", which is a question about
// the calendar alone. Keeping it off the record is what lets the tab bar cost nothing.

describe('latestReadingId', () => {
  it('names the quarter that most recently closed, on every day of a month', () => {
    for (const anchor of SWEEP) {
      const { length } = monthShape(anchor);
      for (let day = 1; day <= length; day += 1) {
        const iso = dayOfMonth(anchor, day);
        const id = latestReadingId(iso);
        expect(id).not.toBeNull();
        const milestone = Number(id!.split('-')[2]);
        // Days 1–7 look back to the previous month's last quarter; after that, to this month's.
        expect([1, 8, 15, 22]).toContain(milestone);
        if (day >= 8) expect(milestone).toBe(day >= 22 ? 15 : day >= 15 ? 8 : 1);
        else expect(milestone).toBe(22);
      }
    }
  });

  it('agrees with the feed: the newest closed reading is the one it names', () => {
    const start = monthShape('2026-06-15').start;
    const today = dayOfMonth(start, 17);
    const feed = readings([daily('a')], doneAcross(['a'], addDaysISO(start, -90), today), today).filter((r) => r.closed);

    expect(feed[0]!.id).toBe(latestReadingId(today));
  });

  it('crosses the month boundary rather than inventing a quarter that has not closed', () => {
    const start = monthShape('2026-06-15').start;
    const previous = hijriParts(addDaysISO(start, -1))!;
    for (const day of [1, 2, 7]) {
      expect(latestReadingId(dayOfMonth(start, day))).toBe(`${previous.year}-${previous.month}-22`);
    }
  });
});
