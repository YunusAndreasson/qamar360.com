import { describe, expect, it } from '@jest/globals';

import { chunkNoteBody, noteStamp } from '@/lib/note-chunks';

/** The module's own budget, mirrored here rather than exported — the constants stay private and are
 *  tested through behaviour, as `note-tidy.ts` does with `MAX_FRAGMENT_WORDS`. */
const BUDGET = 1100;
const MAX_CHUNKS = 8;

/** `words(n)` — n words of five characters each, so length arithmetic in a test is readable. */
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${String(i).padStart(3, '0')}`).join(' ');

/** A paragraph of roughly `chars` characters that still contains sentence ends. */
function sentences(count: number, wordsEach = 12): string {
  return Array.from({ length: count }, (_, i) => `${words(wordsEach).replace(/^w/, `s${i}w`)}.`).join(' ');
}

describe('chunkNoteBody', () => {
  it('returns nothing for an empty or whitespace-only note', () => {
    // A zero vector would score against every query, so there must be no chunk rather than a blank one.
    expect(chunkNoteBody('')).toEqual([]);
    expect(chunkNoteBody('   \n\n  \n ')).toEqual([]);
  });

  it('leaves a short note as one chunk, verbatim', () => {
    const body = 'I prayed Fajr on time. Alḥamdulillāh, it was a quiet morning.';
    expect(chunkNoteBody(body)).toEqual([body]);
  });

  it('packs two sittings into one chunk and keeps the blank line between them', () => {
    // The break is real structure the writer made, and the model reads it.
    const chunks = chunkNoteBody('Morning thought.\n\nEvening thought.');
    expect(chunks).toEqual(['Morning thought.\n\nEvening thought.']);
  });

  it('tolerates the paragraph breaks a typing user actually makes', () => {
    // `appendToBody` emits exactly '\n\n', but a person types '\n\n\n' and '\n \n' too.
    expect(chunkNoteBody('One.\n\n\nTwo.')).toEqual(['One.\n\nTwo.']);
    expect(chunkNoteBody('One.\n \nTwo.')).toEqual(['One.\n\nTwo.']);
  });

  it('splits at a paragraph boundary rather than mid-paragraph when sittings exceed the budget', () => {
    const long = sentences(6); // ~460 chars
    const chunks = chunkNoteBody([long, long, long].join('\n\n'));

    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk is whole paragraphs: none of them starts or ends mid-sentence.
    for (const chunk of chunks) expect(chunk.trim()).toBe(chunk);
    expect(chunks.join('\n\n')).toContain(long);
  });

  it('splits one over-long sitting at sentence ends, carrying a sentence of overlap', () => {
    const paragraph = sentences(30); // well over budget, no paragraph break to use
    const chunks = chunkNoteBody(paragraph);

    expect(chunks.length).toBeGreaterThan(1);
    // The overlap: the last sentence of a chunk opens the next, so a thought straddling the cut is
    // embedded whole somewhere.
    const firstTail = (chunks[0] ?? '').split(/(?<=\.)\s+/).at(-1) ?? '';
    expect(chunks[1] ?? '').toContain(firstTail);
  });

  it('cuts an over-long sentence at a word, never inside one', () => {
    const chunks = chunkNoteBody(words(400)); // one "sentence", no terminal punctuation at all

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Every token is a whole `wNNN`; a mid-word cut would leave a stub like `w12`.
      for (const token of chunk.split(/\s+/)) expect(token).toMatch(/^w\d{3}$/);
    }
  });

  it('takes a hard slice when there is no word boundary to cut at', () => {
    // A URL, or someone leaning on a key. Must not emit one enormous over-budget chunk.
    const chunks = chunkNoteBody('x'.repeat(5000));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(BUDGET);
  });

  it('caps a pathological note rather than letting it own the whole sweep', () => {
    expect(chunkNoteBody(sentences(2000)).length).toBeLessThanOrEqual(MAX_CHUNKS);
    expect(chunkNoteBody('x'.repeat(80_000)).length).toBeLessThanOrEqual(MAX_CHUNKS);
  });

  it('never emits an empty or over-budget chunk, whatever the shape of the note', () => {
    const bodies = [
      'Short.',
      sentences(3),
      [sentences(4), sentences(4)].join('\n\n'),
      sentences(40),
      words(900),
      'a'.repeat(3000),
      ['One.', 'x'.repeat(2500), 'Three.'].join('\n\n'),
      `${sentences(20)}\n\n${'z'.repeat(1500)}\n\nTail.`,
    ];

    for (const body of bodies) {
      for (const chunk of chunkNoteBody(body)) {
        expect(chunk.length).toBeGreaterThan(0);
        expect(chunk.trim()).toBe(chunk);
        expect(chunk.length).toBeLessThanOrEqual(BUDGET);
      }
    }
  });
});

describe('noteStamp', () => {
  it('is stable for the same text', () => {
    expect(noteStamp('I prayed Fajr on time.')).toBe(noteStamp('I prayed Fajr on time.'));
  });

  it('changes on a one-character edit', () => {
    expect(noteStamp('I prayed Fajr on time.')).not.toBe(noteStamp('I prayed Fajr on time!'));
  });

  it('changes when a diacritic is added or removed', () => {
    // The app's orthography differs from plain ASCII by exactly this, and an edit that only restores
    // a diacritic still changes what the note means to a reader.
    expect(noteStamp('I made dua.')).not.toBe(noteStamp('I made duʿāʾ.'));
  });

  it('changes when paragraphs are reordered', () => {
    // Same characters, same length — so this is the case the length half cannot catch and the hash
    // must.
    expect(noteStamp('One.\n\nTwo.')).not.toBe(noteStamp('Two.\n\nOne.'));
  });

  it('survives an empty string and astral-plane characters', () => {
    expect(noteStamp('')).toEqual(expect.any(String));
    expect(noteStamp('🌙')).not.toBe(noteStamp('🌘'));
  });

  it('stays short enough to store once per note', () => {
    // It is written into a blob that holds one entry per day for years; a long stamp is pure cost.
    expect(noteStamp('x'.repeat(10_000)).length).toBeLessThanOrEqual(16);
  });
});
