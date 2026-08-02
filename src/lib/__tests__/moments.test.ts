import { describe, expect, it } from '@jest/globals';

import { orderAfterHabitMove } from '@/lib/drag-order';
import { asMoment, dayOrderPlacement, MOMENT_GROUPS, MOMENTS, momentBand, momentOf, type MomentKey } from '@/lib/moments';
import { DAY_PARTS } from '@/lib/sun';

describe('the moment set', () => {
  it('every moment has a real band or is a Friday moment', () => {
    for (const def of Object.values(MOMENTS)) {
      if (def.band === null) expect(def.friday).toBe(true);
      else expect(DAY_PARTS).toContain(def.band);
    }
  });

  it('the four sky moments share their keys with the day parts, in band', () => {
    for (const part of DAY_PARTS) {
      expect(MOMENTS[part].band).toBe(part);
      expect(MOMENTS[part].until).toBe(true);
    }
  });

  it('prayer moments never carry the clock caption (the no-prayer-times rule)', () => {
    for (const key of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] as MomentKey[]) {
      expect(MOMENTS[key].until).toBeUndefined();
    }
  });

  it('the picker groups cover every moment exactly once', () => {
    const listed = MOMENT_GROUPS.flatMap((g) => g.moments);
    expect([...listed].sort()).toEqual(Object.keys(MOMENTS).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('emblems are distinct within every group (no two moons side by side)', () => {
    for (const group of MOMENT_GROUPS) {
      const icons = group.moments.map((k) => MOMENTS[k].icon);
      expect(new Set(icons).size).toBe(icons.length);
    }
  });

  // The point of a stack is that it hangs off a deed with a definite finish. A label that names
  // an hour instead ("Evening") cannot cue anything, and the mistake is invisible — it still
  // renders, still lights, still reads fine. So the rule is a test.
  it('every non-sky moment is named as a completed deed, never a time', () => {
    const deeds = Object.keys(MOMENTS).filter((k) => !(DAY_PARTS as readonly string[]).includes(k)) as MomentKey[];
    // Past tense, i.e. it already happened: "Prayed Fajr", "Woke up", "Got into bed".
    for (const key of deeds) {
      expect(MOMENTS[key].label).toMatch(/^(Prayed|Woke|Got|Rose|Finished|Left|Came|Sat|Stood)\b/);
    }
    // The four sky bands are the deliberate exception, and stay plain nouns so
    // Settings → Times of day can still say "Morning begins".
    for (const part of DAY_PARTS) expect(MOMENTS[part].label).toBe(MOMENTS[part].stackName);
  });

  it('the weakest-cue group is listed last, so the grid never leads with a bare time', () => {
    expect(MOMENT_GROUPS.at(-1)?.moments).toEqual([...DAY_PARTS]);
    expect(MOMENT_GROUPS[0]?.moments).toContain('fajr');
  });

  it('a stack named after a moment reads as the occasion, not the deed', () => {
    // "Prayed Fajr" is what you anchored to; "After Fajr" is what the card header should say.
    // Only the sky moments (which name no deed) are allowed to reuse one string for both.
    for (const key of Object.keys(MOMENTS) as MomentKey[]) {
      const { label, stackName } = MOMENTS[key];
      if ((DAY_PARTS as readonly string[]).includes(key)) continue;
      expect(stackName).not.toBe(label);
      expect(stackName).toMatch(/^After\b/);
    }
  });
});

describe('asMoment / momentOf', () => {
  it('narrows exactly the defined keys', () => {
    for (const key of Object.keys(MOMENTS)) expect(asMoment(key)).toBe(key);
    expect(asMoment('Morning')).toBeNull();
    expect(asMoment('')).toBeNull();
    expect(asMoment(null)).toBeNull();
    expect(asMoment(undefined)).toBeNull();
  });

  it('prefers the stored moment, falls back to the legacy day_part, never invents', () => {
    expect(momentOf({ moment: 'fajr', day_part: 'morning' })).toBe('fajr');
    expect(momentOf({ moment: null, day_part: 'night' })).toBe('night');
    expect(momentOf({ day_part: 'evening' })).toBe('evening'); // snapshot without the column
    expect(momentOf({ moment: 'garbage', day_part: 'garbage' })).toBeNull();
    expect(momentOf({ moment: null, day_part: null })).toBeNull();
  });

  it('bands follow the moment', () => {
    expect(momentBand('waking-up')).toBe('morning');
    expect(momentBand('isha')).toBe('night');
    expect(momentBand('jumuah')).toBeNull();
    expect(momentBand(null)).toBeNull();
  });
});

describe('dayOrderPlacement', () => {
  // Waking up (morning) at positions 0–1, Noon (midday) at 2–3, Night at 4–5, a loose habit at 6.
  const stacks = [
    { id: 'w', moment: 'waking-up', day_part: 'morning' },
    { id: 'n', moment: 'midday', day_part: 'midday' },
    { id: 'x', moment: 'night', day_part: 'night' },
    { id: 'plain', moment: null, day_part: null },
  ];
  const habits = [
    { position: 0, stack_id: 'w' },
    { position: 1, stack_id: 'w' },
    { position: 2, stack_id: 'n' },
    { position: 3, stack_id: 'n' },
    { position: 4, stack_id: 'x' },
    { position: 5, stack_id: 'x' },
    { position: 6, stack_id: null },
  ];

  it('lands after the last block of an earlier-or-same band', () => {
    expect(dayOrderPlacement(habits, stacks, 'evening')).toEqual({ type: 'after-unit', key: 'stack:n' });
    expect(dayOrderPlacement(habits, stacks, 'maghrib')).toEqual({ type: 'after-unit', key: 'stack:n' });
    expect(dayOrderPlacement(habits, stacks, 'night')).toEqual({ type: 'after-unit', key: 'stack:x' });
  });

  it('lands before the first later block when nothing earlier exists', () => {
    const lateOnly = habits.filter((h) => h.stack_id === 'x');
    expect(dayOrderPlacement(lateOnly, stacks, 'morning')).toEqual({ type: 'before-unit', key: 'stack:x' });
  });

  it('is quiet when it has nothing to say', () => {
    expect(dayOrderPlacement(habits, stacks, null)).toBeNull(); // no moment
    expect(dayOrderPlacement(habits, stacks, 'jumuah')).toBeNull(); // weekday moment, no band
    const noBlocks = [{ position: 0, stack_id: null }];
    expect(dayOrderPlacement(noBlocks, stacks, 'evening')).toBeNull(); // no anchored blocks yet
  });

  it('respects the user’s own block order — the newcomer slots in, nothing else moves', () => {
    // User keeps Night first, then Waking up: adding an evening stack goes after Waking up
    // (the last block ranked ≤ evening in THEIR order), never re-sorting Night.
    const custom = [
      { position: 0, stack_id: 'x' },
      { position: 1, stack_id: 'w' },
    ];
    expect(dayOrderPlacement(custom, stacks, 'evening')).toEqual({ type: 'after-unit', key: 'stack:w' });
  });

  it('feeds orderAfterHabitMove: a first member births the stack at the day slot', () => {
    const all = [
      { id: 'h0', position: 0, stack_id: 'w' },
      { id: 'h1', position: 1, stack_id: 'n' },
      { id: 'h2', position: 2, stack_id: 'x' },
      { id: 'loose', position: 3, stack_id: null },
    ];
    const placement = dayOrderPlacement(all, stacks, 'evening');
    expect(placement).toEqual({ type: 'after-unit', key: 'stack:n' });
    const { orderedIds } = orderAfterHabitMove(all, 'loose', 'new-evening-stack', placement!);
    expect(orderedIds).toEqual(['h0', 'h1', 'loose', 'h2']);
  });
});
