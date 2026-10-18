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

/** Habits the user already keeps. `stack_id` defaults to loose — the common case. */
const owned = (...raw: (string | { name: string; stack_id: string })[]) =>
  raw.map((entry, i) =>
    typeof entry === 'string'
      ? { id: `h${i}`, name: entry, stack_id: null }
      : { id: `h${i}`, name: entry.name, stack_id: entry.stack_id },
  );

/** Every act of every preset, kept loose (or all inside one stack). */
const ownsEverything = (stackId: string | null = null) =>
  PRESETS.map((preset, i) => ({ id: `h${i}`, name: preset.name, stack_id: stackId }));

describe('habitInputFor', () => {
  it('carries the preset schedule, count goal and Hijri recurrence across', () => {
    expect(habitInputFor(PRESETS[3]!)).toEqual({
      name: 'Drank water',
      preset_id: 'water',
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
    const plan = buildCuratedPlan(AFTER_FAJR, PRESETS, [], []);
    expect(plan).not.toBeNull();
    expect(plan!.inputs.map((i) => i.name)).toEqual([
      'Said the duʿāʾ on waking',
      'Prayed Fajr on time',
      'Said the morning adhkār',
    ]);
    expect(plan!.moment).toBe('fajr');
    expect(plan!.existingStackId).toBeNull();
    expect(plan!.gatherIds).toEqual([]);
  });

  it('gathers an act already owned rather than minting a near-duplicate, matching by folded name', () => {
    // Saved before the preset gained its scholarly diacritics — must still count as the same act.
    const plan = buildCuratedPlan(AFTER_FAJR, PRESETS, owned('Said the du’a’ on waking', 'PRAYED FAJR ON TIME'), []);
    expect(plan!.inputs.map((i) => i.name)).toEqual(['Said the morning adhkār']);
    expect(plan!.gatherIds).toEqual(['h0', 'h1']);
  });

  it('keeps the curated sequence when a plan mixes gathered acts with new ones', () => {
    // The order the card numbers 1..n and the order the acts are done in — it must survive the
    // fact that some rows exist already and some are about to.
    const plan = buildCuratedPlan(AFTER_FAJR, PRESETS, owned('Prayed Fajr on time'), []);
    expect(plan!.acts.map((a) => (a.kind === 'own' ? a.habitId : a.input.name))).toEqual([
      'Said the duʿāʾ on waking',
      'h0',
      'Said the morning adhkār',
    ]);
  });

  it('still offers the stack when every act is already owned — owning the acts is not having it', () => {
    // The Ḍuḥā trap: the card used to read "Already yours" over a stack that did not exist, and
    // the only way to make it offer anything again was to delete one of your own habits first.
    const plan = buildCuratedPlan(AFTER_FAJR, PRESETS, ownsEverything(), []);
    expect(plan).not.toBeNull();
    expect(plan!.inputs).toEqual([]);
    expect(plan!.gatherIds).toEqual(['h1', 'h0', 'h2']);
    expect(plan!.existingStackId).toBeNull();
  });

  it('returns null only once the stack exists AND already holds every act', () => {
    const stacks = [{ id: 's1', name: 'fajr' }];
    expect(buildCuratedPlan(AFTER_FAJR, PRESETS, ownsEverything('s1'), stacks)).toBeNull();
    // The same acts kept loose still leave it something to do: gather them in.
    const scattered = buildCuratedPlan(AFTER_FAJR, PRESETS, ownsEverything(), stacks);
    expect(scattered!.existingStackId).toBe('s1');
    expect(scattered!.gatherIds).toHaveLength(3);
  });

  it('copies an act another stack holds instead of pulling it out of that stack', () => {
    // Reading Qurʾān after Fajr and again after ʿIshāʾ are two acts — the ʿIshāʾ one stays put.
    const plan = buildCuratedPlan(
      AFTER_FAJR,
      PRESETS,
      owned({ name: 'Prayed Fajr on time', stack_id: 's2' }, 'Said the morning adhkār'),
      [{ id: 's2', name: 'Isha' }],
    );
    expect(plan!.inputs.map((i) => i.name)).toEqual(['Said the duʿāʾ on waking', 'Prayed Fajr on time']);
    expect(plan!.gatherIds).toEqual(['h1']);
  });

  it('reuses the copy already in the stack being built over a loose twin of it', () => {
    const plan = buildCuratedPlan(
      AFTER_FAJR,
      PRESETS,
      owned('Prayed Fajr on time', { name: 'Prayed Fajr on time', stack_id: 's1' }),
      [{ id: 's1', name: 'Fajr' }],
    );
    expect(plan!.acts).toContainEqual({ kind: 'own', habitId: 'h1' });
    expect(plan!.gatherIds).toEqual([]);
  });

  it('matches a same-named existing stack for appending instead of creating a twin', () => {
    const plan = buildCuratedPlan(AFTER_FAJR, PRESETS, [], [{ id: 's1', name: 'fajr' }]);
    expect(plan!.existingStackId).toBe('s1');
  });

  it('applies a weekly stack’s schedule override to the acts it borrows', () => {
    const plan = buildCuratedPlan(FRIDAY, PRESETS, [], []);
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
