import { describe, expect, it } from '@jest/globals';

import { presetSummary, SUNNAH_PRESETS } from '@/constants/sunnah-habits';
import { DAILY_SCHEDULE } from '@/lib/dates';

describe('presetSummary', () => {
  it('is the measure alone for a counted every-day preset', () => {
    expect(presetSummary({ defaultSchedule: DAILY_SCHEDULE, targetCount: 5, targetUnit: 'prayers' })).toBe('5 prayers');
  });

  it('is the schedule alone for a plain tick on chosen days', () => {
    expect(presetSummary({ defaultSchedule: [1, 4] })).toBe('Mon · Thu');
  });

  it('says nothing for the every-day tick, the case nearly every row is', () => {
    expect(presetSummary({ defaultSchedule: DAILY_SCHEDULE })).toBe('');
  });

  it('joins a measure and a non-daily schedule', () => {
    expect(presetSummary({ defaultSchedule: [5], targetCount: 2, targetUnit: 'pages' })).toBe('2 pages · Fri');
  });
});

describe('catalog names', () => {
  it('never repeat the count their unit already shows', () => {
    // "Said tasbīḥ ×33 after each prayer · 5 prayers" said the same thing twice on Today.
    for (const p of SUNNAH_PRESETS.filter((p) => p.targetUnit === 'prayers')) {
      expect(p.name).not.toMatch(/each prayer/);
    }
  });
});
