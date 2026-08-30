import { describe, expect, it } from '@jest/globals';

import type { Plan } from '@/lib/plans';
import { planMeta, planPicks, scheduledLabel } from '@/lib/plans';

const TODAY = '2026-08-30'; // a Sunday
const TOMORROW = '2026-08-31';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    user_id: 'u1',
    title: 'Denmark with the family',
    body: '',
    position: 0,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('scheduledLabel', () => {
  it('names today', () => {
    expect(scheduledLabel(TODAY, TODAY)).toBe('On today’s list');
  });

  it('names tomorrow', () => {
    expect(scheduledLabel(TOMORROW, TODAY)).toBe('On tomorrow’s list');
  });

  // An open to-do from an earlier day shows on today (tasks.showsOn's carry-forward), so today is
  // where it honestly is — the plan should not send you looking for it on a day that has passed.
  it('says today for one that has carried forward', () => {
    expect(scheduledLabel('2026-08-24', TODAY)).toBe('On today’s list');
  });

  // Unreachable from the UI, which offers only two days — but the function has to be total.
  it('names a further day rather than guessing', () => {
    expect(scheduledLabel('2026-09-05', TODAY)).toBe('On the list for Sat, Sep 5');
  });
});

describe('planMeta', () => {
  it('shows the first line of the notes when nothing is scheduled', () => {
    const meta = planMeta({
      body: '  Legoland, and the beach at Skagen.  \nFerry from Ystad.',
      scheduledOn: null,
      today: TODAY,
    });
    expect(meta).toBe('Legoland, and the beach at Skagen.');
  });

  it('skips leading blank lines and collapses the run of spaces inside one', () => {
    const meta = planMeta({
      body: '\n\n  New   felt   for the roof\nand a door that shuts',
      scheduledOn: null,
      today: TODAY,
    });
    expect(meta).toBe('New felt for the roof');
  });

  // A plan that is still only a name renders no second line at all, rather than an empty one
  // holding space open — the same `null` `carriedLabel` returns for a task on its own day.
  it('has no second line when there are no notes', () => {
    expect(planMeta({ body: '   \n  ', scheduledOn: null, today: TODAY })).toBe(null);
  });

  // The notes are the same notes they were yesterday; the scheduled state is what changed.
  it('lets the scheduled label displace the notes', () => {
    const meta = planMeta({ body: 'Legoland, and the beach at Skagen.', scheduledOn: TOMORROW, today: TODAY });
    expect(meta).toBe('On tomorrow’s list');
  });

  it('still says where the to-do went when there are no notes at all', () => {
    expect(planMeta({ body: '', scheduledOn: TODAY, today: TODAY })).toBe('On today’s list');
  });
});

describe('planPicks', () => {
  const denmark = plan({ id: 'p1' });
  const shed = plan({ id: 'p2', title: 'Rebuild the shed' });
  const bike = plan({ id: 'p3', title: 'Service the bike' });

  it('offers the plans nothing has been pulled from', () => {
    expect(planPicks([denmark, shed], new Map(), TODAY, 3).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  // The field is open because you are adding something to today; the one row guaranteed to be a
  // duplicate is the worst suggestion it could make.
  it('leaves out one already on today’s list', () => {
    const scheduled = new Map([['p1', TODAY]]);
    expect(planPicks([denmark, shed], scheduled, TODAY, 3).map((p) => p.id)).toEqual(['p2']);
  });

  it('leaves out one that carried forward onto today', () => {
    const scheduled = new Map([['p1', '2026-08-24']]);
    expect(planPicks([denmark, shed], scheduled, TODAY, 3).map((p) => p.id)).toEqual(['p2']);
  });

  // Putting it on today as well as tomorrow is a real choice, not a duplicate.
  it('keeps one scheduled for tomorrow', () => {
    const scheduled = new Map([['p1', TOMORROW]]);
    expect(planPicks([denmark, shed], scheduled, TODAY, 3).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('is a strip, not a list — it stops at the limit', () => {
    expect(planPicks([denmark, shed, bike], new Map(), TODAY, 2).map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});
