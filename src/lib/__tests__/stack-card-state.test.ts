import { describe, expect, it } from '@jest/globals';

import { stackHeaderContract } from '@/lib/stack-card-state';

const base = { name: 'Before sleep', memberCount: 3, openCount: 3 };

describe('stackHeaderContract', () => {
  describe('mode', () => {
    it('invites on a stack with no acts yet', () => {
      const header = stackHeaderContract({ ...base, memberCount: 0, openCount: 0 });
      expect(header.mode).toBe('add');
      // The empty card is the one entry the grid won't lift.
      expect(header.hint).not.toMatch(/drag/i);
    });

    it('opens and closes the sequence once the stack has acts', () => {
      expect(stackHeaderContract(base).mode).toBe('fold');
    });

    // The acts are what you tick, and an excused act can still be un-excused from its own row, so
    // a stack whose every act is excused today still has a sequence worth opening.
    it('still opens when every act is excused today', () => {
      expect(stackHeaderContract({ ...base, openCount: 0 }).mode).toBe('fold');
    });
  });

  describe('hint', () => {
    it('says what a tap does to the fold', () => {
      expect(stackHeaderContract(base).hint).toBe('Shows its acts. Hold and drag to reorder it.');
      expect(stackHeaderContract({ ...base, expanded: true }).hint).toBe('Hides its acts. Hold and drag to reorder it.');
    });

    // The header used to seal the whole stack; it must not promise a write it no longer makes.
    it.each([
      ['open', base],
      ['part done', { ...base, doneCount: 2 }],
      ['done', { ...base, doneCount: 3 }],
      ['excused', { ...base, openCount: 0 }],
    ])('never promises to mark acts done (%s)', (_name, input) => {
      expect(stackHeaderContract(input).hint).not.toMatch(/marks|re-opens|done/i);
    });
  });

  describe('summary', () => {
    // Silent at zero: "0 of 3 acts done" is the empty ring beside it said again in words, and a
    // day of untouched stacks should read as a column of names, not of zeroes.
    it('says only the length while nothing is done', () => {
      expect(stackHeaderContract(base).summary).toBe('3 acts');
      expect(stackHeaderContract({ ...base, doneCount: 0 }).summary).toBe('3 acts');
    });

    it('counts how far through the sequence you are', () => {
      expect(stackHeaderContract({ ...base, doneCount: 2 }).summary).toBe('2 of 3 acts done');
    });

    it('still says it at the top of the range, where the stack is kept', () => {
      expect(stackHeaderContract({ ...base, doneCount: 3 }).summary).toBe('3 of 3 acts done');
    });

    it('counts only the acts in play', () => {
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
    it('names the stack and its length', () => {
      expect(stackHeaderContract({ ...base, memberCount: 5, openCount: 3 }).label).toBe(
        'Before sleep stack, 3 acts',
      );
    });

    // The sub-line and the label are the same fact, so they say it in the same words: a screen
    // reader gets the progress the ring is drawing for everyone else.
    it('carries the progress the sub-line shows', () => {
      const header = stackHeaderContract({ ...base, doneCount: 2 });
      expect(header.label).toBe('Before sleep stack, 2 of 3 acts done');
      expect(header.label).toContain(header.summary);
    });

    it('says how many acts an excused stack holds', () => {
      expect(stackHeaderContract({ ...base, openCount: 0 }).label).toBe(
        'Before sleep stack, 3 acts, every act excused today',
      );
    });

    // Open/closed lives on `accessibilityState.expanded`; repeating it in the label would announce
    // it twice.
    it.each([
      ['folded', base],
      ['open', { ...base, expanded: true }],
      ['empty', { ...base, memberCount: 0, openCount: 0 }],
    ])('never spells out the fold state (%s)', (_name, input) => {
      const { label } = stackHeaderContract(input);
      expect(label).not.toMatch(/collapsed|expanded|sealed/i);
    });
  });
});
