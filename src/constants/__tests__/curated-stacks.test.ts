import { describe, expect, it } from '@jest/globals';

import { CURATED_GROUPS, CURATED_STACKS } from '@/constants/curated-stacks';
import { SUNNAH_PRESETS } from '@/constants/sunnah-habits';
import { MOMENTS } from '@/lib/moments';

/**
 * The library is hand-authored id lists, so it can only be wrong silently: a typo shrinks a stack
 * by one act and nothing complains. These are the invariants that keep it honest.
 */
describe('curated stacks', () => {
  const presetIds = new Set(SUNNAH_PRESETS.map((p) => p.id));

  it('every act resolves to a real preset', () => {
    const missing = CURATED_STACKS.flatMap((s) =>
      s.acts.filter((a) => !presetIds.has(a.presetId)).map((a) => `${s.id} → ${a.presetId}`),
    );
    expect(missing).toEqual([]);
  });

  it('every stack is anchored to a real moment', () => {
    const bad = CURATED_STACKS.filter((s) => !Object.hasOwn(MOMENTS, s.moment)).map((s) => s.id);
    expect(bad).toEqual([]);
  });

  it('no preset appears in two stacks — a shared act would vanish from whichever is added second', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const stack of CURATED_STACKS) {
      for (const act of stack.acts) {
        const owner = seen.get(act.presetId);
        if (owner) clashes.push(`${act.presetId}: ${owner} & ${stack.id}`);
        else seen.set(act.presetId, stack.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('every stack is a genuine sequence (≥2 acts) with a unique id and name', () => {
    expect(CURATED_STACKS.filter((s) => s.acts.length < 2).map((s) => s.id)).toEqual([]);
    expect(new Set(CURATED_STACKS.map((s) => s.id)).size).toBe(CURATED_STACKS.length);
    expect(new Set(CURATED_STACKS.map((s) => s.name)).size).toBe(CURATED_STACKS.length);
  });

  it('schedule overrides are real weekday lists, and never applied to a Hijri preset', () => {
    const byId = new Map(SUNNAH_PRESETS.map((p) => [p.id, p]));
    for (const stack of CURATED_STACKS) {
      for (const act of stack.acts) {
        if (!act.schedule) continue;
        expect(act.schedule.length).toBeGreaterThan(0);
        expect(act.schedule.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)).toBe(true);
        expect(byId.get(act.presetId)?.hijriSchedule).toBeUndefined();
      }
    }
  });

  it('CURATED_STACKS is the groups flattened, in library order', () => {
    expect(CURATED_STACKS.map((s) => s.id)).toEqual(CURATED_GROUPS.flatMap((g) => g.stacks.map((s) => s.id)));
  });
});
