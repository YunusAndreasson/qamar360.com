import { describe, expect, it } from '@jest/globals';

import { normalizeName, otherNames, siblingNames } from '@/lib/names';

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

describe('siblingNames', () => {
  const habits = [
    { id: 'a', name: 'Read Qurʾān', stack_id: 'fajr' },
    { id: 'b', name: 'Morning adhkār', stack_id: 'fajr' },
    { id: 'c', name: 'Read Qurʾān', stack_id: 'isha' },
    { id: 'd', name: 'Drink water', stack_id: null },
  ];

  it('collects only the names inside the same stack, so a deed can stand in several', () => {
    expect(siblingNames(habits, 'isha')).toEqual([normalizeName('Read Qurʾān')]);
    expect(siblingNames(habits, 'maghrib')).toEqual([]);
  });

  it('treats the loose habits as one container of their own', () => {
    expect(siblingNames(habits, null)).toEqual([normalizeName('Drink water')]);
  });

  it('leaves out the habit being edited', () => {
    expect(siblingNames(habits, 'fajr', 'a')).toEqual([normalizeName('Morning adhkār')]);
  });
});
