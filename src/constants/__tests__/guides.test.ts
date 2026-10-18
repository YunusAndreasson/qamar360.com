import { describe, expect, it } from '@jest/globals';

import { EXCHANGE_GUIDE, STACKING_GUIDE, type Guide } from '@/constants/guides';

const GUIDES: Guide[] = [STACKING_GUIDE, EXCHANGE_GUIDE];

describe('guides', () => {
  it.each(GUIDES)('$id is complete', (guide) => {
    expect(guide.title.trim()).not.toBe('');
    expect(guide.lede.trim()).not.toBe('');
    expect(guide.why.trim()).not.toBe('');
    expect(guide.image).toBeDefined();
    expect(guide.sections.length).toBeGreaterThan(0);
  });

  it.each(GUIDES)('$id has no empty prose', (guide) => {
    for (const section of guide.sections) {
      expect(section.heading.trim()).not.toBe('');
      expect(section.body.trim()).not.toBe('');
      // `evidence` is optional, but an empty string would render a blank italic line.
      if (section.evidence !== undefined) expect(section.evidence.trim()).not.toBe('');
    }
  });

  // The heading keys the rendered list (`GuideBody`), so a duplicate would collide as a React key
  // — and would mean the same claim was made twice.
  it.each(GUIDES)('$id has unique section headings', (guide) => {
    const headings = guide.sections.map((s) => s.heading);
    expect(new Set(headings).size).toBe(headings.length);
  });

  // These are claims, stopped — the voice the old run-in headings had ("Anchor, don't add."). A
  // heading that trails off has usually been written as the first half of a sentence.
  it.each(GUIDES)('$id ends every heading in a full stop', (guide) => {
    for (const section of guide.sections) expect(section.heading.endsWith('.')).toBe(true);
  });

  // Acts inside a stack tick one at a time (2026-09-08), and the header no longer seals the group
  // in one tap. The guide is the one place the stack is taught, so it must not teach the old rule.
  it('does not teach the retired one-tap seal', () => {
    const prose = STACKING_GUIDE.sections.map((s) => s.body).join(' ');
    expect(prose).not.toMatch(/one tap seals|only thing the app records|aren’t a checklist/i);
  });

  it('gives the two guides distinct ids', () => {
    expect(new Set(GUIDES.map((g) => g.id)).size).toBe(GUIDES.length);
  });

  // The exchange library shows a "Why this works" disclosure on every curated card, one level
  // below the intro's own disclosure. If a guide reused that label the same screen would ask the
  // same question at two different scopes.
  it('keeps the intro disclosure label clear of the cards’ own', () => {
    const whys = GUIDES.map((g) => g.why);
    for (const why of whys) expect(why).not.toBe('Why this works');
    expect(new Set(whys).size).toBe(whys.length);
  });
});
