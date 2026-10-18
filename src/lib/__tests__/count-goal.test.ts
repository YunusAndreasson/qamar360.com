import { describe, expect, it } from '@jest/globals';

import { countGoalLabel, countTakeBack, countTap } from '@/lib/count-goal';

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

  it('clears a completed goal, as a tap on a ticked row always has', () => {
    expect(countTap(8, 8, true)).toEqual({ status: 'clear' });
    // A done row logged before counts existed carries no count at all.
    expect(countTap(0, 8, true)).toEqual({ status: 'clear' });
  });

  // A target lowered under an existing count is reconciled by the editor, but a tap must not
  // count past the target if it ever lands first.
  it('never counts past the target', () => {
    expect(countTap(9, 8, false)).toEqual({ status: 'clear' });
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
