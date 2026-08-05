import { describe, expect, it } from '@jest/globals';

import { exchangeRowContract, isExchange } from '@/lib/exchange';

const base = {
  name: 'Drank water',
  insteadOf: 'soft drinks',
  cue: 'when I sit down to eat',
  held: false,
  skipped: false,
};

describe('isExchange', () => {
  it('is an exchange once it names what it displaces', () => {
    expect(isExchange({ instead_of: 'soft drinks' })).toBe(true);
  });

  it('is an ordinary act without one', () => {
    expect(isExchange({ instead_of: null })).toBe(false);
  });

  // A blank would render a meta line reading "Instead of " and put the row in a section it has
  // no business being in — treat it as the absence it is.
  it('treats an empty string as no exchange at all', () => {
    expect(isExchange({ instead_of: '' })).toBe(false);
  });
});

describe('exchangeRowContract', () => {
  describe('mode', () => {
    it('is open while it is in play and unheld', () => {
      const row = exchangeRowContract(base);
      expect(row.mode).toBe('open');
      expect(row.enabled).toBe(true);
    });

    it('is held once it has been ticked', () => {
      expect(exchangeRowContract({ ...base, held: true }).mode).toBe('held');
    });

    it('goes inert when excused for the day', () => {
      const row = exchangeRowContract({ ...base, skipped: true });
      expect(row.mode).toBe('excused');
      expect(row.enabled).toBe(false);
    });

    // Skipping a held row deletes its 'done' row and writes 'skipped' in its place, so the two
    // can't both be true in storage — but a mid-flight optimistic update can show both, and the
    // row must not then offer to un-hold something that is no longer recorded.
    it('prefers excused over held when the two could both apply', () => {
      const row = exchangeRowContract({ ...base, held: true, skipped: true });
      expect(row.mode).toBe('excused');
      expect(row.checked).toBe(false);
    });
  });

  describe('meta', () => {
    it('names what it displaces and the moment it hits', () => {
      expect(exchangeRowContract(base).meta).toBe('soft drinks · when I sit down to eat');
    });

    it('says less rather than inventing a moment when there is no cue', () => {
      expect(exchangeRowContract({ ...base, cue: null }).meta).toBe('soft drinks');
      expect(exchangeRowContract({ ...base, cue: '' }).meta).toBe('soft drinks');
    });

    // The section this row lives in is captioned INSTEAD OF, so a row that said it again was
    // restating its own heading — and the three words pushed a plain pairing onto a second line.
    // The SPOKEN label keeps the phrase (a screen reader has no caption in earshot).
    it('leaves "instead of" to the section caption, but keeps it in the spoken label', () => {
      const row = exchangeRowContract(base);
      expect(row.meta).not.toMatch(/instead of/i);
      expect(row.label).toContain('instead of soft drinks');
    });

    // The row title is the deed alone; the meta carries the rest. If the two overlapped, the
    // pairing would read twice on one row.
    it('never repeats the deed', () => {
      expect(exchangeRowContract(base).meta).not.toContain(base.name);
    });
  });

  describe('label', () => {
    it('reads as one sentence: the deed, what it replaces, when', () => {
      expect(exchangeRowContract(base).label).toBe(
        'Drank water, instead of soft drinks, when I sit down to eat',
      );
    });

    it('drops the moment when there is no cue', () => {
      expect(exchangeRowContract({ ...base, cue: null }).label).toBe('Drank water, instead of soft drinks');
    });

    it('says an excused row is excused, since nothing else announces that', () => {
      expect(exchangeRowContract({ ...base, skipped: true }).label).toContain('excused today');
    });

    // Held-ness lives on `accessibilityState.checked` for this same element. Spelling it out here
    // too would have a screen reader announce it twice — the trap the stack header was fixed for.
    it.each([
      ['open', base],
      ['held', { ...base, held: true }],
      ['excused', { ...base, skipped: true }],
    ])('never spells out held-ness itself (%s)', (_name, input) => {
      expect(exchangeRowContract(input).label).not.toMatch(/\bheld\b/i);
    });

    // The middle dot is a typographic separator; a screen reader either skips it or reads it as
    // something unhelpful. Commas are what make the label pause in the right places.
    it('uses commas, not the separator the eye reads', () => {
      expect(exchangeRowContract(base).label).not.toContain('·');
    });
  });

  describe('hint', () => {
    it('promises the tick while open', () => {
      expect(exchangeRowContract(base).hint).toBe('Marks it held for today.');
    });

    it('offers the way back out once held', () => {
      expect(exchangeRowContract({ ...base, held: true }).hint).toBe('Clears it for today.');
    });

    // An inert row can't honour an instruction, so its hint states the situation instead of
    // describing an action that belongs to the ⋯ button beside it.
    it('promises nothing on an excused row', () => {
      const { hint } = exchangeRowContract({ ...base, skipped: true });
      expect(hint).not.toMatch(/marks/i);
      expect(hint).not.toMatch(/clears/i);
    });
  });

  describe('role', () => {
    it.each([
      ['open', base],
      ['held', { ...base, held: true }],
      ['excused', { ...base, skipped: true }],
    ])('always announces as a checkbox — the row is the control (%s)', (_name, input) => {
      expect(exchangeRowContract(input).role).toBe('checkbox');
    });
  });

  // The whole point of the feature: what is recorded is the good deed, never the absence of the
  // old one. A negation phrasing anywhere in the contract would be the one thing the evidence
  // says makes the habit stronger.
  describe('framing', () => {
    it.each([
      ['open', base],
      ['held', { ...base, held: true }],
      ['excused', { ...base, skipped: true }],
    ])('never phrases the claim as an avoidance (%s)', (_name, input) => {
      const { label, hint, meta } = exchangeRowContract(input);
      for (const text of [label, hint, meta]) {
        expect(text).not.toMatch(/avoid|resist|didn't|did not|abstain|quit/i);
      }
    });
  });
});
