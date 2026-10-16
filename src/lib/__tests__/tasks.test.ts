import { describe, expect, it } from '@jest/globals';

import type { Task } from '@/lib/tasks';
import { carriedLabel, isOpen, openCountOn, openTitlesOn, showsOn, splitTasks, taskRowContract, visibleTasks } from '@/lib/tasks';

const TODAY = '2026-08-06'; // a Thursday

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    user_id: 'u1',
    title: 'Call the landlord',
    due_on: TODAY,
    done_on: null,
    plan_id: null,
    position: 0,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('showsOn', () => {
  it('shows an open task on its own day', () => {
    expect(showsOn(task(), TODAY, TODAY)).toBe(true);
  });

  // The carry-forward: the reason a one-off list is worth writing on at all.
  it('carries an unfinished task forward onto today', () => {
    expect(showsOn(task({ due_on: '2026-08-01' }), TODAY, TODAY)).toBe(true);
  });

  it('still lists that unfinished task on the day it was written', () => {
    expect(showsOn(task({ due_on: '2026-08-01' }), '2026-08-01', TODAY)).toBe(true);
  });

  // But not on every day in between — it belongs to its own day and to now, nothing else.
  it('does not fill the days between', () => {
    expect(showsOn(task({ due_on: '2026-08-01' }), '2026-08-03', TODAY)).toBe(false);
  });

  it('shows a done task only on the day it was done', () => {
    const done = task({ due_on: '2026-08-01', done_on: '2026-08-02' });
    expect(showsOn(done, '2026-08-02', TODAY)).toBe(true);
    expect(showsOn(done, '2026-08-01', TODAY)).toBe(false);
    expect(showsOn(done, TODAY, TODAY)).toBe(false);
  });

  // Ticked today it stays put for the rest of the day, then leaves — the "greys in place" rule.
  it('keeps a task ticked today on today', () => {
    expect(showsOn(task({ done_on: TODAY }), TODAY, TODAY)).toBe(true);
  });
});

describe('visibleTasks', () => {
  // A ticked row must not move out from under the finger that ticked it — no sinking the done
  // ones to the foot, which would take the undo with them.
  it('keeps the order they were written in, finished or not', () => {
    const rows = [
      task({ id: 'done', done_on: TODAY, position: 0 }),
      task({ id: 'second', position: 2 }),
      task({ id: 'first', position: 1 }),
    ];
    expect(visibleTasks(rows, TODAY, TODAY).map((t) => t.id)).toEqual(['done', 'first', 'second']);
  });

  it('drops everything that belongs to another day', () => {
    const rows = [task({ id: 'here' }), task({ id: 'elsewhere', due_on: '2026-08-09', done_on: '2026-08-09' })];
    expect(visibleTasks(rows, TODAY, TODAY).map((t) => t.id)).toEqual(['here']);
  });
});

describe('openCountOn', () => {
  it('counts only what is still to do on that day', () => {
    const rows = [
      task({ id: 'a' }),
      task({ id: 'b', due_on: '2026-08-01' }), // carried forward
      task({ id: 'c', done_on: TODAY }),
    ];
    expect(openCountOn(rows, TODAY, TODAY)).toBe(2);
  });

  it('is zero on a day with nothing outstanding', () => {
    expect(openCountOn([task({ done_on: TODAY })], TODAY, TODAY)).toBe(0);
  });
});

describe('isOpen', () => {
  it('is open until it has a day it was done on', () => {
    expect(isOpen(task())).toBe(true);
    expect(isOpen(task({ done_on: TODAY }))).toBe(false);
  });
});

describe('carriedLabel', () => {
  it('says nothing for a task on its own day', () => {
    expect(carriedLabel(TODAY, TODAY)).toBeNull();
  });

  it('names yesterday', () => {
    expect(carriedLabel('2026-08-05', TODAY)).toBe('Yesterday');
  });

  it('uses a bare weekday while that is unambiguous', () => {
    expect(carriedLabel('2026-08-02', TODAY)).toBe('Sunday');
  });

  // Past a week the weekday repeats, so it has to carry the date.
  it('carries the date once a weekday would repeat', () => {
    expect(carriedLabel('2026-07-20', TODAY)).toMatch(/Jul/);
  });

  // A task created while browsing a past day is dated then, never ahead of today.
  it('says nothing for a day that isn’t past', () => {
    expect(carriedLabel('2026-08-09', TODAY)).toBeNull();
  });
});

describe('taskRowContract', () => {
  it('is an open checkbox until it is ticked', () => {
    const row = taskRowContract({ title: 'Call the landlord', dueOn: TODAY, today: TODAY, done: false });
    expect(row).toMatchObject({ mode: 'open', role: 'checkbox', checked: false, meta: null });
    expect(row.hint).toBe('Marks it done.');
  });

  it('flips to done, and offers the way back', () => {
    const row = taskRowContract({ title: 'Call the landlord', dueOn: TODAY, today: TODAY, done: true });
    expect(row).toMatchObject({ mode: 'done', checked: true });
    expect(row.hint).toBe('Puts it back on the list.');
  });

  // The sighted row shows where a carried task came from; the spoken one has to say it too.
  it('speaks the day a carried task came from', () => {
    const row = taskRowContract({ title: 'Call the landlord', dueOn: '2026-08-05', today: TODAY, done: false });
    expect(row.meta).toBe('Yesterday');
    expect(row.label).toBe('Call the landlord, from yesterday');
  });

  it('leaves the label bare on its own day', () => {
    expect(taskRowContract({ title: 'Call the landlord', dueOn: TODAY, today: TODAY, done: false }).label).toBe(
      'Call the landlord',
    );
  });
});

describe('openTitlesOn', () => {
  // A to-do put on tomorrow shows on no day until tomorrow — correct, and the reason the head of
  // Today has to be able to name it in the meantime.
  it('names the open to-dos waiting on a day', () => {
    const rows = [
      task({ id: 'a', title: 'Ferry tickets', due_on: '2026-08-07', position: 1 }),
      task({ id: 'b', title: 'Pack the car', due_on: '2026-08-07', position: 0 }),
      task({ id: 'c', title: 'Call the landlord', due_on: TODAY }),
    ];
    expect(openTitlesOn(rows, '2026-08-07')).toEqual(['Pack the car', 'Ferry tickets']);
  });

  it('leaves out one already done', () => {
    const rows = [task({ due_on: '2026-08-07', done_on: '2026-08-07' })];
    expect(openTitlesOn(rows, '2026-08-07')).toEqual([]);
  });

  // Date-exact, and deliberately unlike `showsOn`: this answers "what is that day asking for",
  // and its one caller asks it about tomorrow. So a to-do stays listed under the day it was
  // written for whether or not that day has passed...
  it('lists a to-do under its own day, past or not', () => {
    const rows = [task({ due_on: '2026-08-01' })];
    expect(openTitlesOn(rows, '2026-08-01')).toEqual(['Call the landlord']);
  });

  // ...and does not follow the carry-forward onto today, which is where `showsOn` would put it.
  it('does not carry an overdue to-do onto another day', () => {
    const rows = [task({ due_on: '2026-08-01' })];
    expect(openTitlesOn(rows, TODAY)).toEqual([]);
  });
});

describe('splitTasks', () => {
  const open = (id: string, position: number) => task({ id, position, done_on: null });
  const done = (id: string, position: number) => task({ id, position, done_on: '2026-08-15' });
  const NONE = new Map<string, 'open' | 'done'>();

  it('folds the finished ones away once there are two of them, keeping position order', () => {
    const { open: o, done: d } = splitTasks([open('a', 0), done('b', 1), open('c', 2), done('d', 3)], NONE);
    expect(o.map((t) => t.id)).toEqual(['a', 'c']);
    expect(d.map((t) => t.id)).toEqual(['b', 'd']);
  });

  it('keeps a lone finished to-do in the list: a fold that would hold one line is no fold', () => {
    const { open: o, done: d } = splitTasks([open('a', 0), done('b', 1)], NONE);
    expect(o.map((t) => t.id)).toEqual(['a', 'b']);
    expect(d).toEqual([]);
  });

  it('holds a just-ticked to-do where it was ticked, until the list settles', () => {
    const tasks = [done('a', 0), done('b', 1), done('c', 2)];
    const { open: o, done: d } = splitTasks(tasks, new Map([['c', 'open' as const]]));
    expect(o.map((t) => t.id)).toEqual(['c']);
    expect(d.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('holds an un-ticked to-do inside the open fold rather than pulling it out under the finger', () => {
    const tasks = [done('a', 0), open('b', 1), done('c', 2)];
    const { done: d } = splitTasks(tasks, new Map([['b', 'done' as const]]));
    expect(d.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
