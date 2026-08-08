import { describe, expect, it } from '@jest/globals';

import { habitRowContract } from '@/lib/loose-row';

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
