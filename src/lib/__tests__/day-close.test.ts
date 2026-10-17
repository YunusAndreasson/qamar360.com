import { describe, expect, it } from '@jest/globals';

import {
  dayCloseAfter,
  openTasksOn,
  setOpenTasksProbe,
  type ClosableHabit,
} from '@/lib/day-close';

const DAY = '2026-08-06'; // a Thursday
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function habit(id: string, overrides: Partial<ClosableHabit> = {}): ClosableHabit {
  return { id, created_at: null, schedule_days: EVERY_DAY, hijri_schedule: null, ...overrides };
}

const none = new Set<string>();

describe('dayCloseAfter', () => {
  it('closes the day when the last act lands', () => {
    const close = dayCloseAfter([habit('a'), habit('b')], none, new Set(['a']), new Set(['b']), DAY, 0);
    expect(close.dayComplete).toBe(true);
    expect(close.doneIds.sort()).toEqual(['a', 'b']);
  });

  it('stays open while an act is untouched', () => {
    expect(dayCloseAfter([habit('a'), habit('b')], none, new Set(['a']), none, DAY, 0).dayComplete).toBe(false);
  });

  it('excuses a skipped act rather than waiting on it', () => {
    const close = dayCloseAfter([habit('a'), habit('b')], new Set(['b']), none, new Set(['a']), DAY, 0);
    expect(close.dayComplete).toBe(true);
    // The excused act earns no degrees either — it is out of the rate entirely.
    expect(close.doneIds).toEqual(['a']);
  });

  it('ignores an act that isn’t scheduled today', () => {
    const thursday = habit('a');
    const fridayOnly = habit('b', { schedule_days: [5] });
    expect(dayCloseAfter([thursday, fridayOnly], none, none, new Set(['a']), DAY, 0).dayComplete).toBe(true);
  });

  // The whole point of the gate: a day with something still on its list isn't finished.
  it('is held back by an open task', () => {
    expect(dayCloseAfter([habit('a')], none, none, new Set(['a']), DAY, 1).dayComplete).toBe(false);
  });

  it('closes once that task is done too', () => {
    expect(dayCloseAfter([habit('a')], none, none, new Set(['a']), DAY, 0).dayComplete).toBe(true);
  });

  // Tasks can only hold the day back, never close it: the celebration belongs to the practice.
  it('never closes a day that had no practice in it', () => {
    expect(dayCloseAfter([], none, none, none, DAY, 0).dayComplete).toBe(false);
    expect(dayCloseAfter([habit('a', { schedule_days: [5] })], none, none, none, DAY, 0).dayComplete).toBe(false);
  });

  it('reports no done ids while the day is open', () => {
    expect(dayCloseAfter([habit('a')], none, none, none, DAY, 0).doneIds).toEqual([]);
  });
});

describe('the open-tasks probe', () => {
  it('reads as no open tasks with nothing registered', () => {
    expect(openTasksOn(DAY)).toBe(0);
  });

  it('answers from the registered probe, and stops when it unregisters', () => {
    const off = setOpenTasksProbe((day) => (day === DAY ? 2 : 0));
    expect(openTasksOn(DAY)).toBe(2);
    expect(openTasksOn('2026-08-05')).toBe(0);
    off();
    expect(openTasksOn(DAY)).toBe(0);
  });

  // A remount registers before the old provider's cleanup runs; that cleanup must not blind the
  // app to the tasks the new one is now publishing.
  it('keeps a newer probe when a stale cleanup fires', () => {
    const offFirst = setOpenTasksProbe(() => 1);
    setOpenTasksProbe(() => 3);
    offFirst();
    expect(openTasksOn(DAY)).toBe(3);
    setOpenTasksProbe(() => 0)();
  });
});

describe('dayCloseAfter — a habit that belongs to no stack', () => {
  // The rule reads a flat list of habits and knows nothing about stacks, which is what made an
  // unanchored habit a real bug until it became tickable: it counted toward the day exactly like a
  // stacked act, while no gesture in the app could ever put it in `completed`. So the day never
  // closed, the celebration never fired, and the badge never reached zero. These two cases pin the
  // behaviour the fix relies on — that such a habit is an ordinary participant, no more and no less.
  it('holds the day open while it is untouched', () => {
    // 'a' is a sealed stack's act, 'loose' belongs to nothing. The stack is done; the day is not.
    expect(dayCloseAfter([habit('a'), habit('loose')], none, new Set(['a']), none, DAY, 0).dayComplete).toBe(false);
  });

  it('closes the day once it is ticked, and earns its degrees', () => {
    const close = dayCloseAfter([habit('a'), habit('loose')], none, new Set(['a']), new Set(['loose']), DAY, 0);
    expect(close.dayComplete).toBe(true);
    expect(close.doneIds.sort()).toEqual(['a', 'loose']);
  });

  it('can close a day made only of loose habits', () => {
    const close = dayCloseAfter([habit('x'), habit('y')], none, new Set(['x', 'y']), none, DAY, 0);
    expect(close.dayComplete).toBe(true);
  });
});
