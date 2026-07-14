import { describe, expect, it } from '@jest/globals';

import type { StarterStack, SunnahPreset } from '@/constants/sunnah-habits';
import { normalizeName } from '@/lib/names';
import { buildStarterPlan } from '@/lib/starter';

// Minimal presets — only the fields the planner reads (id, name) matter here.
const preset = (id: string, name: string): SunnahPreset => ({
  id,
  categoryId: 'salah',
  name,
  detail: '',
  evidence: '',
  defaultSchedule: [0, 1, 2, 3, 4, 5, 6],
});

const PRESETS: SunnahPreset[] = [
  preset('fajr', 'Pray Fajr on time'),
  preset('waking', 'Duʿāʾ on waking'),
  preset('adhkar-am', 'Morning adhkār'),
  preset('isha', 'Pray ʿIshāʾ on time'),
  preset('adhan', 'Answer the adhān'),
];

const STARTERS: StarterStack[] = [
  { name: 'Morning', presetIds: ['waking', 'fajr', 'adhkar-am'] },
  { name: 'Night', presetIds: ['isha', 'ghost-id'] }, // ghost-id is not in the catalog
];
const STANDALONE = ['adhan'];

const names = (...raw: string[]) => new Set(raw.map(normalizeName));

describe('buildStarterPlan', () => {
  it('groups the remaining presets in stack order and counts the standalone tail', () => {
    const plan = buildStarterPlan(PRESETS, names(), [], STARTERS, STANDALONE);
    expect(plan.groups.map((g) => g.name)).toEqual(['Morning', 'Night']);
    expect(plan.groups[0]!.presets.map((p) => p.id)).toEqual(['waking', 'fajr', 'adhkar-am']);
    // The id missing from the catalog just drops out — no crash, no phantom habit.
    expect(plan.groups[1]!.presets.map((p) => p.id)).toEqual(['isha']);
    expect(plan.lone.map((p) => p.id)).toEqual(['adhan']);
    expect(plan.total).toBe(5);
  });

  it('skips presets already added, matching by the folded name (diacritics ignored)', () => {
    // Saved before the preset gained its scholarly diacritics — must still count as added.
    const plan = buildStarterPlan(PRESETS, names('Du’a’ on waking', 'PRAY FAJR ON TIME'), [], STARTERS, STANDALONE);
    expect(plan.groups[0]!.presets.map((p) => p.id)).toEqual(['adhkar-am']);
    expect(plan.total).toBe(3);
  });

  it('drops a group whose presets are all added — no empty stacks from the starter', () => {
    const plan = buildStarterPlan(PRESETS, names('Pray ʿIshāʾ on time'), [], STARTERS, STANDALONE);
    expect(plan.groups.map((g) => g.name)).toEqual(['Morning']);
  });

  it('matches a same-named existing stack for appending instead of creating a twin', () => {
    const plan = buildStarterPlan(PRESETS, names(), [{ id: 's1', name: 'morning' }], STARTERS, STANDALONE);
    expect(plan.groups[0]!.existingStackId).toBe('s1');
    expect(plan.groups[1]!.existingStackId).toBeNull();
  });

  it('returns an all-empty plan when everything is already added', () => {
    const all = names(...PRESETS.map((p) => p.name));
    const plan = buildStarterPlan(PRESETS, all, [], STARTERS, STANDALONE);
    expect(plan.groups).toEqual([]);
    expect(plan.lone).toEqual([]);
    expect(plan.total).toBe(0);
  });
});
