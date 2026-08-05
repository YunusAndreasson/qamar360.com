import { describe, expect, it } from '@jest/globals';

import type { CuratedStack } from '@/constants/curated-stacks';
import type { SunnahPreset } from '@/constants/sunnah-habits';
import { buildCuratedPlan, habitInputFor, suggestedMoments } from '@/lib/curated';
import { normalizeName } from '@/lib/names';

// Minimal presets — only the fields the planner reads matter here.
const preset = (id: string, name: string, extra: Partial<SunnahPreset> = {}): SunnahPreset => ({
  id,
  categoryId: 'salah',
  name,
  detail: '',
  evidence: '',
  defaultSchedule: [0, 1, 2, 3, 4, 5, 6],
  ...extra,
});

const PRESETS: SunnahPreset[] = [
  preset('fajr', 'Prayed Fajr on time'),
  preset('waking', 'Said the duʿāʾ on waking'),
  preset('adhkar-am', 'Said the morning adhkār'),
  preset('water', 'Drank water', { targetCount: 8, targetUnit: 'cups' }),
  preset('kahf', 'Recited al-Kahf on Friday', { defaultSchedule: [5] }),
  preset('ashura', 'Fasted ʿĀshūrāʾ', { defaultSchedule: [], hijriSchedule: { dates: [{ month: 1, day: 10 }] } }),
];

const AFTER_FAJR: CuratedStack = {
  id: 'after-fajr',
  name: 'Fajr',
  moment: 'fajr',
  blurb: '',
  acts: [{ presetId: 'waking' }, { presetId: 'fajr' }, { presetId: 'ghost-id' }, { presetId: 'adhkar-am' }],
};

const FRIDAY: CuratedStack = {
  id: 'friday',
  name: 'Friday',
  moment: 'jumuah',
  blurb: '',
  acts: [{ presetId: 'kahf' }, { presetId: 'water', schedule: [5] }],
};

const names = (...raw: string[]) => new Set(raw.map(normalizeName));

describe('habitInputFor', () => {
  it('carries the preset schedule, count goal and Hijri recurrence across', () => {
    expect(habitInputFor(PRESETS[3]!)).toEqual({
      name: 'Drank water',
      schedule_days: [0, 1, 2, 3, 4, 5, 6],
      hijri_schedule: null,
      target_count: 8,
      target_unit: 'cups',
    });
  });

  it('applies a weekday override, but never to a Hijri preset', () => {
    expect(habitInputFor(PRESETS[3]!, [5]).schedule_days).toEqual([5]);
    // A Hijri act keeps its empty weekday list — its recurrence lives in hijri_schedule.
    const hijri = habitInputFor(PRESETS[5]!, [5]);
    expect(hijri.schedule_days).toEqual([]);
    expect(hijri.hijri_schedule).toEqual({ dates: [{ month: 1, day: 10 }] });
  });
});

describe('buildCuratedPlan', () => {
  it('plans the acts in sequence order and drops ids missing from the catalog', () => {
    const plan = buildCuratedPlan(AFTER_FAJR, PRESETS, names(), []);
    expect(plan).not.toBeNull();
    expect(plan!.inputs.map((i) => i.name)).toEqual([
      'Said the duʿāʾ on waking',
      'Prayed Fajr on time',
      'Said the morning adhkār',
    ]);
    expect(plan!.moment).toBe('fajr');
    expect(plan!.existingStackId).toBeNull();
  });

  it('skips acts already owned, matching by the folded name (diacritics ignored)', () => {
    // Saved before the preset gained its scholarly diacritics — must still count as owned.
    const plan = buildCuratedPlan(AFTER_FAJR, PRESETS, names('Said the du’a’ on waking', 'PRAYED FAJR ON TIME'), []);
    expect(plan!.inputs.map((i) => i.name)).toEqual(['Said the morning adhkār']);
  });

  it('returns null when every act is already owned — the library reads that as added', () => {
    const all = names(...PRESETS.map((p) => p.name));
    expect(buildCuratedPlan(AFTER_FAJR, PRESETS, all, [])).toBeNull();
  });

  it('matches a same-named existing stack for appending instead of creating a twin', () => {
    const plan = buildCuratedPlan(AFTER_FAJR, PRESETS, names(), [{ id: 's1', name: 'fajr' }]);
    expect(plan!.existingStackId).toBe('s1');
  });

  it('applies a weekly stack’s schedule override to the acts it borrows', () => {
    const plan = buildCuratedPlan(FRIDAY, PRESETS, names(), []);
    expect(plan!.inputs.map((i) => i.schedule_days)).toEqual([[5], [5]]);
  });
});

describe('suggestedMoments', () => {
  it('maps every curated act’s folded name to its stack’s moment', () => {
    const map = suggestedMoments(PRESETS, [AFTER_FAJR, FRIDAY]);
    expect(map.get(normalizeName('Prayed Fajr on time'))).toBe('fajr');
    expect(map.get(normalizeName('Recited al-Kahf on Friday'))).toBe('jumuah');
    // An act the library doesn't know has no suggestion — the user picks by hand.
    expect(map.get(normalizeName('Fasted ʿĀshūrāʾ'))).toBeUndefined();
  });
});
