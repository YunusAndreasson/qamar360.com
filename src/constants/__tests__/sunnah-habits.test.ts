import { describe, expect, it } from '@jest/globals';

import { presetSummary, scheduleSummary, SUNNAH_PRESETS } from '@/constants/sunnah-habits';
import { DAILY_SCHEDULE } from '@/lib/dates';

describe('presetSummary', () => {
  it('leads with the measure when the preset is counted', () => {
    expect(presetSummary({ defaultSchedule: DAILY_SCHEDULE, targetCount: 5, targetUnit: 'prayers' })).toBe(
      '5 prayers · Every day',
    );
  });

  it('is the schedule alone for a plain tick', () => {
    expect(presetSummary({ defaultSchedule: [1, 4] })).toBe('Mon · Thu');
  });
});

describe('scheduleSummary', () => {
  it('reads weekdays the way Today does, in the week’s own order', () => {
    // Saturday opens the Jumuʿah week, so it reads first — not last, as a Sunday-first sort had it.
    expect(scheduleSummary([0, 6])).toBe('Sat · Sun');
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
