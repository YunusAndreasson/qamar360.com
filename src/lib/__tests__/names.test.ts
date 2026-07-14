import { describe, expect, it } from '@jest/globals';

import { dedupeName, normalizeName, otherNames } from '@/lib/names';

describe('normalizeName', () => {
  it('trims and lower-cases', () => {
    expect(normalizeName('  Morning Prayer ')).toBe('morning prayer');
  });

  it('folds combining diacritics (ā ṣ ḥ ū ī …)', () => {
    expect(normalizeName('Morning adhkār')).toBe('morning adhkar');
    expect(normalizeName('Read 1 page of Qurʾān')).toBe('read 1 page of quran');
  });

  it('strips ʿayn and hamza letters', () => {
    expect(normalizeName('Two rakʿah after wuḍūʾ')).toBe('two rakah after wudu');
    expect(normalizeName('Duʿāʾ on waking')).toBe('dua on waking');
  });

  it('matches a diacritics-renamed preset against a plain saved habit', () => {
    // The regression Discover hit live: these offered as "not added" and duplicated on tap.
    expect(normalizeName('Pray ʿAṣr on time')).toBe(normalizeName('Pray Asr on time'));
    expect(normalizeName('Pray ʿIshāʾ on time')).toBe(normalizeName('Pray Isha on time'));
    expect(normalizeName('Sleep upon wuḍūʾ')).toBe(normalizeName('Sleep upon wudu'));
  });

  it('keeps genuinely different names apart', () => {
    expect(normalizeName('Pray Fajr on time')).not.toBe(normalizeName('Pray Dhuhr on time'));
  });
});

describe('otherNames', () => {
  it('excludes the item itself and normalizes the rest', () => {
    const items = [
      { id: 'a', name: 'Morning adhkār' },
      { id: 'b', name: 'Evening adhkār' },
    ];
    expect(otherNames(items, 'a')).toEqual(['evening adhkar']);
  });
});

describe('dedupeName', () => {
  it('returns the base untouched when it is free', () => {
    expect(dedupeName('Read a page of Qurʾān', new Set())).toBe('Read a page of Qurʾān');
  });

  it('appends the smallest free numeric suffix (starting at 2)', () => {
    const taken = new Set([normalizeName('Read a page of Qurʾān')]);
    expect(dedupeName('Read a page of Qurʾān', taken)).toBe('Read a page of Qurʾān 2');
  });

  it('skips suffixes already taken', () => {
    const taken = new Set(
      ['Qurʾān', 'Qurʾān 2', 'Qurʾān 3'].map(normalizeName),
    );
    expect(dedupeName('Qurʾān', taken)).toBe('Qurʾān 4');
  });

  it('matches the taken set through the same diacritic folding (no near-duplicate slips by)', () => {
    // A plain-saved "Read 1 page of Quran" must block the diacritical preset name.
    const taken = new Set([normalizeName('Read 1 page of Quran')]);
    expect(dedupeName('Read 1 page of Qurʾān', taken)).toBe('Read 1 page of Qurʾān 2');
  });
});
