import { describe, expect, it } from '@jest/globals';

import { stackHeaderContract } from '@/lib/stack-card-state';

const base = { name: 'Before sleep', memberCount: 3, openCount: 3, sealed: false, lit: false };

describe('stackHeaderContract', () => {
  describe('mode', () => {
    it('invites on a stack with no acts yet', () => {
      const header = stackHeaderContract({ ...base, memberCount: 0, openCount: 0 });
      expect(header.mode).toBe('add');
      expect(header.enabled).toBe(true);
      expect(header.checked).toBeUndefined();
      // It only navigates — there is no state to toggle, so it must not announce as a checkbox.
      expect(header.role).toBe('button');
      // The empty card is the one entry the grid won't lift.
      expect(header.hint).not.toMatch(/drag/i);
    });

    it('goes inert when every act is excused today', () => {
      const header = stackHeaderContract({ ...base, openCount: 0 });
      expect(header.mode).toBe('excused');
      expect(header.enabled).toBe(false);
      expect(header.checked).toBe(false);
      expect(header.label).toContain('every act excused today');
      // Nothing to assert, so the hint must not promise a seal.
      expect(header.hint).not.toMatch(/marks all/i);
    });

    it('seals when at least one act is in play', () => {
      const header = stackHeaderContract(base);
      expect(header.mode).toBe('seal');
      expect(header.enabled).toBe(true);
    });

    // An excused-but-otherwise-complete stack is NOT sealed (isStackComplete returns false for an
    // empty open set), so `excused` has to win over `sealed` or the header would offer an undo
    // for a seal that never happened.
    it('prefers excused over sealed when the two could both apply', () => {
      expect(stackHeaderContract({ ...base, openCount: 0, sealed: true }).mode).toBe('excused');
    });
  });

  describe('checked', () => {
    it.each([
      ['open', base],
      ['sealed', { ...base, sealed: true }],
      ['excused', { ...base, openCount: 0 }],
    ])('announces a sealable header as a checkbox (%s)', (_name, input) => {
      expect(stackHeaderContract(input).role).toBe('checkbox');
    });

    it('is false while the stack is open', () => {
      expect(stackHeaderContract(base).checked).toBe(false);
    });

    it('is true once the stack is sealed', () => {
      expect(stackHeaderContract({ ...base, sealed: true }).checked).toBe(true);
    });
  });

  describe('hint', () => {
    it('promises the seal, counting only the acts in play', () => {
      const header = stackHeaderContract({ ...base, memberCount: 5, openCount: 3 });
      expect(header.hint).toBe('Marks all 3 acts done for today. Hold and drag to reorder it.');
    });

    // Acts tick on their own now, so the header's tap finishes what is left rather than doing all
    // of it — promising "all 3" would name work already behind the reader.
    it('promises only the remainder once some acts are ticked', () => {
      const header = stackHeaderContract({ ...base, openCount: 3, doneCount: 2 });
      expect(header.hint).toBe('Marks the remaining 1 act done for today. Hold and drag to reorder it.');
    });

    it('offers the way back out once sealed', () => {
      const header = stackHeaderContract({ ...base, sealed: true });
      expect(header.hint).toBe('Re-opens the stack for today. Hold and drag to reorder it.');
    });

    it('says "1 act", not "1 acts"', () => {
      expect(stackHeaderContract({ ...base, memberCount: 1, openCount: 1 }).hint).toContain('all 1 act done');
    });
  });

  describe('summary', () => {
    // Silent at zero: "0 of 3 acts done" is the empty ring beside it said again in words, and a
    // day of untouched stacks should read as a column of names, not of zeroes.
    it('says only the length while nothing is done', () => {
      expect(stackHeaderContract(base).summary).toBe('3 acts');
      expect(stackHeaderContract({ ...base, doneCount: 0 }).summary).toBe('3 acts');
    });

    // The whole point of the field now that acts tick individually: every value in between is
    // reachable, and it is the one thing the ring can only approximate.
    it('counts how far through the sequence you are', () => {
      expect(stackHeaderContract({ ...base, doneCount: 2 }).summary).toBe('2 of 3 acts done');
    });

    it('still says it at the top of the range, where the stack has sealed', () => {
      expect(stackHeaderContract({ ...base, doneCount: 3, sealed: true }).summary).toBe('3 of 3 acts done');
    });

    it('counts only the acts a seal would assert', () => {
      expect(stackHeaderContract({ ...base, memberCount: 5, openCount: 3 }).summary).toBe('3 acts');
      // An excused act is out of the sequence, so it is out of both halves of the count.
      expect(stackHeaderContract({ ...base, memberCount: 5, openCount: 3, doneCount: 1 }).summary).toBe(
        '1 of 3 acts done',
      );
    });

    it('says "1 act", not "1 acts"', () => {
      expect(stackHeaderContract({ ...base, memberCount: 1, openCount: 1 }).summary).toBe('1 act');
    });

    it('says the day excused the whole stack', () => {
      expect(stackHeaderContract({ ...base, openCount: 0 }).summary).toBe('Every act excused today');
    });

    // The empty card's own body row already invites; the sub-line must not offer it twice.
    it('does not repeat the empty card\'s invitation', () => {
      expect(stackHeaderContract({ ...base, memberCount: 0, openCount: 0 }).summary).toBe('No acts yet');
    });
  });

  describe('label', () => {
    it('names the stack and how much a seal would commit', () => {
      expect(stackHeaderContract({ ...base, memberCount: 5, openCount: 3 }).label).toBe(
        'Before sleep stack, 3 acts',
      );
    });

    // The sub-line and the label are the same fact, so they say it in the same words — a screen
    // reader gets the progress the ring is drawing for everyone else.
    it('carries the progress the sub-line shows', () => {
      const header = stackHeaderContract({ ...base, doneCount: 2 });
      expect(header.label).toBe('Before sleep stack, 2 of 3 acts done');
      expect(header.label).toContain(header.summary);
    });

    it('explains the clock, with its closing time when the moment publishes one', () => {
      expect(stackHeaderContract({ ...base, lit: true, until: '9:47 PM' }).label).toBe(
        'Before sleep stack, current time of day until 9:47 PM, 3 acts',
      );
    });

    it('says the moment is current without a clock for one that has none (the prayers)', () => {
      expect(stackHeaderContract({ ...base, lit: true }).label).toBe(
        'Before sleep stack, current time of day, 3 acts',
      );
    });

    it('says "1 act", not "1 acts"', () => {
      expect(stackHeaderContract({ ...base, memberCount: 1, openCount: 1 }).label).toContain('1 act');
    });

    // Both states now live on `accessibilityState` — sealed as `checked` here, folded as
    // `expanded` on the chevron beside it. Repeating either in the label would announce it twice.
    it.each([
      ['sealed', { ...base, sealed: true }],
      ['folded', base],
      ['excused', { ...base, openCount: 0 }],
      ['empty', { ...base, memberCount: 0, openCount: 0 }],
    ])('never spells out the state itself (%s)', (_name, input) => {
      const { label } = stackHeaderContract(input);
      expect(label).not.toMatch(/sealed/i);
      expect(label).not.toMatch(/collapsed/i);
    });
  });
});
