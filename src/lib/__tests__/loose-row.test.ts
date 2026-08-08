import { describe, expect, it } from '@jest/globals';

import { DAILY_SCHEDULE } from '@/lib/dates';
import { habitMetaLine, habitRowContract } from '@/lib/loose-row';

// Expectations are derived from *intended* behaviour, never copied from current output — a red
// test means the code is wrong, not the test.
const row = (over: Partial<Parameters<typeof habitRowContract>[0]> = {}) =>
  habitRowContract({ name: 'Walked outside', meta: '', done: false, skipped: false, ...over });

describe('habitRowContract — the three states', () => {
  it('is open and tappable with nothing recorded', () => {
    const c = row();
    expect(c.mode).toBe('open');
    expect(c.enabled).toBe(true);
    expect(c.checked).toBe(false);
    expect(c.role).toBe('checkbox');
    expect(c.hint).toBe('Marks it done for today.');
  });

  it('reads as checked once done, and offers the way back', () => {
    const c = row({ done: true });
    expect(c.mode).toBe('held');
    expect(c.checked).toBe(true);
    expect(c.enabled).toBe(true);
    expect(c.hint).toBe('Clears it for today.');
    // Never ", done" in the label: `checked` on the same element already says it, and saying it
    // twice is what the stack header's label was cleaned up to stop doing.
    expect(c.label).toBe('Walked outside');
  });

  it('goes inert when excused, and says so rather than instructing', () => {
    const c = row({ skipped: true });
    expect(c.mode).toBe('excused');
    expect(c.enabled).toBe(false);
    expect(c.checked).toBe(false);
    expect(c.label).toContain('excused today');
    expect(c.hint).toBe('Excused for today — nothing to record.');
  });

  it('lets excused outrank done — an excused row can never also be asserting', () => {
    const c = row({ done: true, skipped: true });
    expect(c.mode).toBe('excused');
    expect(c.checked).toBe(false);
    expect(c.enabled).toBe(false);
  });
});

describe('habitRowContract — what is seen and what is spoken', () => {
  it('keeps the visible title free of the meta, whatever the name contains', () => {
    // The title is carried in its own field precisely so it is never re-derived from the spoken
    // label — a name with a comma in it would be truncated by any such split.
    const c = row({ name: 'Walked, then sat', meta: '3 pages' });
    expect(c.title).toBe('Walked, then sat');
    expect(c.meta).toBe('3 pages');
  });

  it('folds the meta into the spoken label as one sentence', () => {
    expect(row({ meta: '3 pages' }).label).toBe('Walked outside, 3 pages');
    // …and says only the name when there is no meta, rather than a trailing comma.
    expect(row().label).toBe('Walked outside');
  });

  it('carries the meta through every state', () => {
    expect(row({ meta: '3 pages', done: true }).meta).toBe('3 pages');
    expect(row({ meta: '3 pages', skipped: true }).meta).toBe('3 pages');
  });
});

describe('habitMetaLine — the second line', () => {
  const meta = (over: Partial<Parameters<typeof habitMetaLine>[0]> = {}) =>
    habitMetaLine({
      targetCount: null,
      targetUnit: null,
      scheduleDays: DAILY_SCHEDULE,
      hijriSchedule: null,
      weekStart: 0,
      ...over,
    });

  it('says nothing for the ordinary habit — every day, no goal', () => {
    // "Every day" is the default and the majority: a line carrying it costs every row a second
    // line to state the unremarkable, and spends the slot the exceptions need.
    expect(meta()).toBe('');
  });

  it('states a count goal on its own', () => {
    expect(meta({ targetCount: 3, targetUnit: 'pages' })).toBe('3 pages');
    // A bare count keeps its number rather than rendering "3 " with a dangling space.
    expect(meta({ targetCount: 3 })).toBe('3');
  });

  it('states a partial week on its own, in the user’s own week order', () => {
    expect(meta({ scheduleDays: [1, 3, 5] })).toBe('Mon · Wed · Fri');
    // weekStart moves the reading order without touching the stored 0=Sunday indices.
    expect(meta({ scheduleDays: [0, 1], weekStart: 1 })).toBe('Mon · Sun');
  });

  it('joins a goal and a schedule with the row middot', () => {
    expect(meta({ targetCount: 3, targetUnit: 'pages', scheduleDays: [1, 3, 5] })).toBe('3 pages · Mon · Wed · Fri');
  });

  it('always states a Hijri schedule, since it is never the default', () => {
    // The one thing about such a habit you cannot infer from seeing it on today's list.
    expect(meta({ hijriSchedule: { monthDays: [13, 14, 15] } })).toBe('White Days (13–15)');
    expect(meta({ targetCount: 1, targetUnit: 'fast', hijriSchedule: { months: [9] } })).toBe('1 fast · Ramaḍān');
  });

  it('passes an empty schedule through rather than reading as an everyday habit', () => {
    // Unreachable from the day (scheduledOn keeps it off every date), but if one ever surfaces the
    // row should say what it is instead of looking ordinary.
    expect(meta({ scheduleDays: [] })).toBe('No days');
  });
});
