import { describe, expect, it } from '@jest/globals';

import { countGoalLabel, countTakeBack, countTap, toggleHint } from '@/lib/count-goal';

describe('countTap', () => {
  it('adds one per tap', () => {
    expect(countTap(0, 8, false)).toEqual({ status: 'partial', count: 1 });
    expect(countTap(3, 8, false)).toEqual({ status: 'partial', count: 4 });
  });

  it('completes on the tap that reaches the target', () => {
    expect(countTap(7, 8, false)).toEqual({ status: 'done', count: 8 });
  });

  it('completes a target of one in a single tap, like a binary habit', () => {
    expect(countTap(0, 1, false)).toEqual({ status: 'done', count: 1 });
  });

  // A tap on a met goal takes ONE back, the way a tap on a done binary row un-does it — but at the
  // cost of a unit, not the day: one habitual extra tap on a full glass must not wipe all eight.
  it('takes one back from a completed goal instead of clearing the day', () => {
    expect(countTap(8, 8, true)).toEqual({ status: 'partial', count: 7 });
    // A done row logged before counts existed carries no count at all: it stands at its target.
    expect(countTap(0, 8, true)).toEqual({ status: 'partial', count: 7 });
  });

  it('un-does a completed target of one, exactly like a binary row', () => {
    expect(countTap(1, 1, true)).toEqual({ status: 'clear' });
  });

  it('is the same step the `⋯` sheet takes back, once the goal is met', () => {
    expect(countTap(8, 8, true)).toEqual(countTakeBack(8, 8, true));
  });

  // A 'partial' row already at or past its target (a target lowered under it, a row out of sync)
  // is a met goal the row never said so about. The tap completes it at the target — it must not
  // read it as done and take one back, nor clear it.
  it('completes a partial row that already reached its target', () => {
    expect(countTap(8, 8, false)).toEqual({ status: 'done', count: 8 });
    expect(countTap(9, 8, false)).toEqual({ status: 'done', count: 8 });
  });
});

describe('toggleHint', () => {
  it('names what the tap does on each kind of row', () => {
    expect(toggleHint(false, false)).toBe('Marks it done for today.');
    expect(toggleHint(true, false)).toBe('Takes it back for today.');
    expect(toggleHint(false, true)).toBe('Counts one.');
    expect(toggleHint(true, true)).toBe('Takes one back.');
  });
});

describe('countTakeBack', () => {
  it('steps a partial count down by one', () => {
    expect(countTakeBack(4, 8, false)).toEqual({ status: 'partial', count: 3 });
  });

  it('steps a completed goal down from its target', () => {
    expect(countTakeBack(8, 8, true)).toEqual({ status: 'partial', count: 7 });
    expect(countTakeBack(0, 8, true)).toEqual({ status: 'partial', count: 7 });
  });

  it('clears the row when the last one is taken back', () => {
    expect(countTakeBack(1, 8, false)).toEqual({ status: 'clear' });
    expect(countTakeBack(1, 1, true)).toEqual({ status: 'clear' });
  });
});

describe('countGoalLabel', () => {
  it('reads as the goal while nothing is logged', () => {
    expect(countGoalLabel(8, 'cups')).toBe('8 cups');
  });

  it('says how far partway', () => {
    expect(countGoalLabel(8, 'cups', 3)).toBe('3 of 8 cups');
  });

  it('reads as the goal again once it is met', () => {
    expect(countGoalLabel(8, 'cups', 8, true)).toBe('8 cups');
  });

  it('works without a unit', () => {
    expect(countGoalLabel(5, null, 2)).toBe('2 of 5');
    expect(countGoalLabel(5, '')).toBe('5');
  });
});
