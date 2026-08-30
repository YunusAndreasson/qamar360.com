import { describe, expect, it } from '@jest/globals';

import { dailyNoteRefresh } from '@/lib/daily-note';

describe('dailyNoteRefresh', () => {
  it('preserves an unsaved draft when the local day rolls over', () => {
    expect(dailyNoteRefresh('2026-08-30', '2026-08-31', 'Still writing', '')).toEqual({
      dayChanged: true,
      shouldLoad: false,
    });
  });

  it('allows a safe refresh without local edits', () => {
    expect(dailyNoteRefresh('2026-08-30', '2026-08-30', 'Saved note', 'Saved note')).toEqual({
      dayChanged: false,
      shouldLoad: true,
    });
  });
});
