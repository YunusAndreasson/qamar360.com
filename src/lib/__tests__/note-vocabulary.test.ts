import { describe, expect, it } from '@jest/globals';

import { applyVocabulary, buildVocabulary, foldText } from '@/lib/note-vocabulary';

const V = buildVocabulary();

/** What the module is for: the recogniser hears the word correctly and spells it in the wrong
 *  alphabet, and the app has an opinion about the alphabet. */
function say(text: string, names: readonly string[] = []): string {
  return applyVocabulary(text, names.length ? buildVocabulary(names) : V);
}

describe('foldText', () => {
  it('folds the app’s orthography onto what a person would type', () => {
    expect(foldText('Alḥamdulillāh')).toBe('alhamdulillah');
    expect(foldText('duʿāʾ')).toBe('dua');
    expect(foldText('ʿIshāʾ')).toBe('isha');
    expect(foldText('Qurʾān')).toBe('quran');
    expect(foldText('al-Kahf')).toBe('alkahf');
  });

  it('is stable under the apostrophes a keyboard substitutes', () => {
    expect(foldText("du'a")).toBe(foldText('duʿāʾ'));
    expect(foldText('du’a')).toBe(foldText('duʿāʾ'));
  });
});

describe('applyVocabulary', () => {
  it('writes the app’s spelling for what was heard', () => {
    expect(say('I made dua after isha')).toBe('I made duʿāʾ after ʿIshāʾ');
  });

  it('reads a whole phrase as one term', () => {
    expect(say('we will go tomorrow inshallah')).toBe('we will go tomorrow in shāʾ Allāh');
    expect(say('subhan allah it was beautiful')).toBe('Subḥān Allāh it was beautiful');
  });

  it('capitalises a term that opens a sentence, and only there', () => {
    expect(say('Alhamdulillah. I made dua.')).toBe('Alḥamdulillāh. I made duʿāʾ.');
    // The same term, mid-sentence, keeps its own lowercase.
    expect(say('Today the dua came easily.')).toBe('Today the duʿāʾ came easily.');
  });

  it('leaves punctuation exactly where the recogniser put it', () => {
    expect(say('I read quran, made dua, and slept.')).toBe('I read Qurʾān, made duʿāʾ, and slept.');
  });

  // The full stop between two sentences must not be swallowed by a phrase match reaching over it.
  it('never matches a phrase across a sentence boundary', () => {
    expect(say('I remembered Allah. Isha was hard.')).toBe('I remembered Allāh. ʿIshāʾ was hard.');
  });

  it('bridges a small misspelling in a long word, but not a short one', () => {
    expect(say('alhamdulilah for today')).toBe('Alḥamdulillāh for today');
    // "sabr" and "sabt" are one edit apart, so nothing under six letters is allowed to move.
    expect(say('I felt sabt today')).toBe('I felt sabt today');
  });

  it('never fires inside a longer word', () => {
    expect(say('the duhamel building')).toBe('the duhamel building');
  });

  it('leaves ordinary English entirely alone', () => {
    const plain = 'A long, hard day. I was tired and did not do much at all.';
    expect(say(plain)).toBe(plain);
  });

  it('is a no-op on an empty vocabulary', () => {
    expect(applyVocabulary('made dua', new Map())).toBe('made dua');
  });
});

describe('buildVocabulary with the user’s own names', () => {
  it('takes the distinctive words out of a habit name, not the whole phrase', () => {
    // "Read a page of Qurʾān" must not capitalise the verb in "I did read a page".
    const out = say('I did read a page of quran', ['Read a page of Qurʾān']);
    expect(out).toBe('I did read a page of Qurʾān');
  });

  it('takes a one-word stack name whole', () => {
    expect(say('missed fajr again', ['Fajr'])).toBe('missed Fajr again');
  });

  it('lets the user’s own spelling win over the curated one', () => {
    // Someone who named their stack "Zuhr" means Zuhr; rewriting them to `Dhuhr` in their own
    // diary would be the app arguing with them.
    expect(say('prayed zuhr late', ['Zuhr'])).toBe('prayed Zuhr late');
  });

  it('ignores words too short to be safely distinctive', () => {
    expect(say('it was a good day', ['Du'])).toBe('it was a good day');
  });
});
