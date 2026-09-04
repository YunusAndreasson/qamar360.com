import { describe, expect, it } from '@jest/globals';

import { fromPickerDate, toPickerDate } from '@/lib/calendar-picker';

describe('native calendar dates', () => {
  it('sends local calendar components as UTC midnight', () => {
    expect(toPickerDate(new Date(2026, 0, 1, 23, 45)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('returns the selected UTC calendar day as a local day', () => {
    const selected = fromPickerDate(new Date('2026-01-01T00:00:00.000Z'));
    expect([selected.getFullYear(), selected.getMonth(), selected.getDate(), selected.getHours()]).toEqual([2026, 0, 1, 12]);
  });
});
