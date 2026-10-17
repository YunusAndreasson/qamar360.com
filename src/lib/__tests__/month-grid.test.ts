import { describe, expect, it } from '@jest/globals';

import { monthGrid, monthOf, stepMonth } from '@/lib/month-grid';

describe('monthGrid', () => {
  // October 2026 begins on a Thursday and has 31 days.
  it('starts the month under its own weekday, in a week that runs Saturday to Jumuʿah', () => {
    const weeks = monthGrid(2026, 9);
    // Sat, Sun, Mon, Tue, Wed are blank; Thursday the 1st, Jumuʿah the 2nd closes the row.
    expect(weeks[0]!.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(weeks[0]![5]).toEqual({ iso: '2026-10-01', day: 1 });
    expect(weeks[0]![6]).toEqual({ iso: '2026-10-02', day: 2 });
    expect(weeks[1]![0]).toEqual({ iso: '2026-10-03', day: 3 }); // a Saturday opens the next
  });

  it('holds every day once, in whole weeks, blank at both ends', () => {
    const weeks = monthGrid(2026, 9);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const days = weeks.flat().filter((d) => d !== null);
    expect(days.map((d) => d.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(days[30]!.iso).toBe('2026-10-31');
  });

  it('knows February', () => {
    expect(monthGrid(2028, 1).flat().filter(Boolean)).toHaveLength(29); // a leap year
    expect(monthGrid(2027, 1).flat().filter(Boolean)).toHaveLength(28);
  });
});

describe('monthOf / stepMonth', () => {
  it('reads the month from a date and steps across year ends', () => {
    expect(monthOf('2026-10-17')).toEqual({ year: 2026, month: 9 });
    expect(stepMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(stepMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});
