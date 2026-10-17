import { describe, expect, it } from '@jest/globals';

import { addDaysISO, hijriMonthRange } from '@/lib/dates';
import {
  asMonthLength,
  LUNAR_PHASES,
  MILESTONE_ASSET_KEYS,
  MILESTONE_DAYS,
  milestoneAssetKey,
  phaseOf,
  phaseOn,
} from '@/lib/lunar-phase';

// A Hijri month is 29 or 30 days, and the milestone days have to land in the right quarter in
// both — otherwise a 29-day month would tell someone "full moon" over a gibbous one.
const MONTH_LENGTHS = [29, 30] as const;

describe('phaseOf', () => {
  it.each(MONTH_LENGTHS)('names the four milestones correctly in a %i-day month', (length) => {
    expect(phaseOf(1, length).phase).toBe('new');
    expect(phaseOf(8, length).phase).toBe('first-quarter');
    expect(phaseOf(15, length).phase).toBe('full');
    expect(phaseOf(22, length).phase).toBe('last-quarter');
  });

  it('walks the whole cycle in order across a month', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 30; day += 1) seen.add(phaseOf(day, 30).phase);
    // Every phase is reachable — no eighth of the cycle is unnameable.
    expect(seen.size).toBe(LUNAR_PHASES.length);
  });

  it('distinguishes waxing from waning at identical illumination', () => {
    // Days 8 and 24 sit symmetrically about the full moon, so `moonIllumination` returns the
    // same lit fraction for both — the naming has to come from the direction of travel, not
    // from how much of the disc is lit.
    const waxing = phaseOf(8, 30);
    const waning = phaseOf(24, 30);
    expect(waxing.illumination).toBeCloseTo(waning.illumination, 5);
    expect(waxing.waxing).toBe(true);
    expect(waning.waxing).toBe(false);
    expect(waxing.phase).toBe('first-quarter');
    expect(waning.phase).toBe('last-quarter');
  });

  it('carries a human label for every phase', () => {
    for (const day of [1, 4, 8, 11, 15, 19, 22, 26]) {
      expect(phaseOf(day, 30).label).toMatch(/\S/);
    }
    expect(phaseOf(15, 30).label).toBe('Full moon');
  });

  it('survives a zero-length month and a day past the month end', () => {
    expect(phaseOf(1, 0).phase).toBe('new');
    expect(LUNAR_PHASES).toContain(phaseOf(35, 30).phase);
  });
});

describe('milestones', () => {
  it('is exactly the four quarter days', () => {
    expect(MILESTONE_DAYS).toEqual([1, 8, 15, 22]);
  });
});

describe('asset keys', () => {
  it('coerces any month length onto the two the generator renders', () => {
    expect(asMonthLength(29)).toBe(29);
    expect(asMonthLength(30)).toBe(30);
    expect(asMonthLength(31)).toBe(30);
    expect(asMonthLength(0)).toBe(29);
  });

  it('is stable, zero-padded, and one key per milestone × month length', () => {
    expect(milestoneAssetKey(1, 30)).toBe('d01-l30');
    expect(milestoneAssetKey(22, 29)).toBe('d22-l29');
    expect(MILESTONE_ASSET_KEYS).toHaveLength(MILESTONE_DAYS.length * MONTH_LENGTHS.length);
    expect(new Set(MILESTONE_ASSET_KEYS).size).toBe(MILESTONE_ASSET_KEYS.length);
  });
});

describe('phaseOn', () => {
  // 6 Jumādā al-Awwal 1448 (Umm al-Qura), in a 30-day month.
  const range = hijriMonthRange('2026-10-17');
  if (!range) throw new Error('Islamic calendar unavailable in this test environment');

  it("reads a day's moon off its Hijri date, as every moon in the app does", () => {
    expect(phaseOn(range.start)).toEqual(phaseOf(1, range.length));
    expect(phaseOn(addDaysISO(range.start, 12))).toEqual(phaseOf(13, range.length));
  });

  it('moves with the Hijri offset, so a month sighted a day later shows the earlier moon', () => {
    expect(phaseOn(addDaysISO(range.start, 12), -1)).toEqual(phaseOf(12, range.length));
  });
});
