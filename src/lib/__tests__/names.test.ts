import { describe, expect, it } from '@jest/globals';

import { clashOnMove, moveRefusal, normalizeName, otherNames, refusedStacks, siblingNames } from '@/lib/names';

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

// Fajr holds "Read Qurʾān"; ʿIshāʾ holds its own; a loose "Read Quran" and a loose "Walk" stand
// outside any stack. The same deed may live in several stacks — just never twice in one container.
const placed = [
  { id: 'f1', name: 'Read Qurʾān', stack_id: 'fajr' },
  { id: 'f2', name: 'Morning adhkār', stack_id: 'fajr' },
  { id: 'i1', name: 'Read Qurʾān', stack_id: 'isha' },
  { id: 'l1', name: 'Read Quran', stack_id: null },
  { id: 'l2', name: 'Walk', stack_id: null },
];

describe('clashOnMove', () => {
  it('refuses a move into a stack that already holds the name, however it is spelled', () => {
    expect(clashOnMove(placed, 'l1', 'fajr')).toBe('Read Quran');
  });

  it('lets the same deed into a stack that does not hold it yet', () => {
    expect(clashOnMove(placed, 'f2', 'isha')).toBeNull();
    expect(clashOnMove(placed, 'l2', 'fajr')).toBeNull();
  });

  it('treats the loose habits as one container on the way out', () => {
    expect(clashOnMove(placed, 'f1', null)).toBe('Read Qurʾān');
    expect(clashOnMove(placed, 'f2', null)).toBeNull();
  });

  it('never refuses a reorder within the habit’s own container', () => {
    expect(clashOnMove(placed, 'f1', 'fajr')).toBeNull();
  });

  it('says nothing about a habit it cannot find', () => {
    expect(clashOnMove(placed, 'gone', 'fajr')).toBeNull();
  });
});

describe('moveRefusal', () => {
  it('names the stack and what it already has', () => {
    expect(moveRefusal('Fajr', 'Read Qurʾān')).toBe('Fajr already has “Read Qurʾān”');
    expect(moveRefusal(null, 'Walk')).toBe('“Walk” is already in Habits');
  });
});

describe('refusedStacks', () => {
  it('lists, per act, the other stacks that already hold its name', () => {
    const refused = refusedStacks(placed);
    expect(refused.get('f1')).toEqual(['isha']);
    expect(refused.get('i1')).toEqual(['fajr']);
    // A loose habit is refused by every stack that holds its name — the drag never carries one,
    // but the map stays honest.
    expect(refused.get('l1')).toEqual(['fajr', 'isha']);
    expect(refused.has('f2')).toBe(false);
    expect(refused.has('l2')).toBe(false);
  });
});
