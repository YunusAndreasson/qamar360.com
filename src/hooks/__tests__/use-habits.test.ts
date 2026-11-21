import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { ANALYTICS_EVENTS } from '@/constants/analytics';
import { HabitsProvider, useHabits, type Habit } from '@/hooks/use-habits';
import type * as Analytics from '@/lib/analytics';
import type * as Dates from '@/lib/dates';
import { haptics } from '@/lib/haptics';

type WriteResult = { error: Error | null };
const mockUpsert = jest.fn<(row: unknown) => Promise<WriteResult>>();
const mockDelete = jest.fn<(id: unknown, day: unknown) => Promise<WriteResult>>();
const mockInsert = jest.fn<(rows: Record<string, unknown>[]) => Promise<{ data: Habit[]; error: null }>>();
const mockUser = { id: 'user', email: 'qa@example.test' };
const mockCelebrate = jest.fn();
const mockToast = jest.fn();
const mockTrack = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockRegister = jest.fn((..._args: unknown[]) => Promise.resolve());
const habit = (id: string, patch: Partial<Habit> = {}): Habit => ({
  id, user_id: 'user', name: id, preset_id: null, position: 0,
  created_at: null, updated_at: null, schedule_days: [0, 1, 2, 3, 4, 5, 6],
  hijri_schedule: null, target_count: null, target_unit: null,
  instead_of: null, cue: null, stack_id: null, ...patch,
});
const mockHabits = [
  habit('member', { stack_id: 'stack' }), habit('second', { stack_id: 'stack' }),
  habit('loose'), habit('counted', { target_count: 3 }), habit('skipped'),
];

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@/hooks/use-lunar-updates', () => ({ useLunarUpdates: () => {} }));
jest.mock('@/components/day-complete', () => ({ useDayComplete: () => ({ celebrate: mockCelebrate }) }));
jest.mock('@/components/toast', () => ({ useToast: () => ({ show: mockToast }) }));
jest.mock('@/lib/preferences', () => ({ usePreference: () => 0 }));
jest.mock('@/lib/analytics', () => ({
  ...jest.requireActual<typeof Analytics>('@/lib/analytics'),
  analytics: { track: (...args: unknown[]) => mockTrack(...args), register: (...args: unknown[]) => mockRegister(...args) },
}));
jest.mock('@/lib/dates', () => ({
  ...jest.requireActual<typeof Dates>('@/lib/dates'),
  todayLocalISO: () => '2026-10-18',
}));
jest.mock('@/lib/habits-cache', () => ({
  readHabitsSnapshot: () => null, writeHabitsSnapshot: () => {},
  readPendingPurges: () => ({ habits: [], habit_stacks: [] }), writePendingPurges: () => {},
}));
jest.mock('@/lib/haptics', () => ({ haptics: {
  completed: jest.fn(), uncompleted: jest.fn(), stackComplete: jest.fn(),
  celebrate: jest.fn(), selection: jest.fn(),
} }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  rpc: () => Promise.resolve({ error: null }),
  from: (table: string) => {
    const filters = new Map<string, unknown>();
    let deleting = false;
    let inserting: Record<string, unknown>[] | null = null;
    const query = {
      select: () => query,
      order: () => query,
      eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
      upsert: (row: unknown) => mockUpsert(row),
      update: () => query,
      insert: (rows: Record<string, unknown>[]) => { inserting = rows; return query; },
      delete: () => { deleting = true; return query; },
      then: (resolve: (value: { data: unknown; error: Error | null }) => unknown) => {
        if (inserting) return mockInsert(inserting).then(resolve);
        if (deleting) return mockDelete(filters.get('habit_id'), filters.get('completed_at')).then((result) => resolve({ data: null, ...result }));
        const data = table === 'habits' ? mockHabits : table === 'habit_stacks'
          ? [{ id: 'stack', name: 'Stack' }]
          : [{ habit_id: 'second', status: 'done', count: null }, { habit_id: 'skipped', status: 'skipped', count: null }];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  },
} }));

const wrapper = ({ children }: { children: ReactNode }) => createElement(HabitsProvider, null, children);
const paths = ['toggleAct', 'toggleLoose'] as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mockDelete.mockReset().mockResolvedValue({ error: null });
});

it.each(paths)('%s records a binary completion and takes it back', async (action) => {
  const hook = await renderHook(useHabits, { wrapper });
  await act(async () => { await hook.result.current[action]('loose'); });
  expect(hook.result.current.completed.has('loose')).toBe(true);
  expect(mockUpsert).toHaveBeenCalledWith({ habit_id: 'loose', user_id: 'user', completed_at: '2026-10-18', status: 'done', count: null });
  await act(async () => { await hook.result.current[action]('loose'); });
  expect(hook.result.current.completed.has('loose')).toBe(false);
  expect(mockDelete).toHaveBeenCalledWith('loose', '2026-10-18');
  expect(haptics.uncompleted).toHaveBeenCalledTimes(1);
});

it.each(paths)('%s counts one unit and ignores excused, missing and temporary rows', async (action) => {
  const hook = await renderHook(useHabits, { wrapper });
  await act(async () => {
    await hook.result.current[action]('counted');
    await hook.result.current[action]('skipped');
    await hook.result.current[action]('missing');
    await hook.result.current[action]('temp-pending');
  });
  expect(hook.result.current.counts.get('counted')).toBe(1);
  expect(hook.result.current.completed.has('counted')).toBe(false);
  expect(mockUpsert).toHaveBeenCalledTimes(1);
  expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'partial', count: 1 }));
});

it.each(paths)('%s prevents duplicate binary writes, rolls back a failure and allows retry', async (action) => {
  let resolve!: (value: WriteResult) => void;
  mockUpsert.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
  const hook = await renderHook(useHabits, { wrapper });
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.result.current[action]('loose');
    await hook.result.current[action]('loose');
  });
  expect(hook.result.current.completed.has('loose')).toBe(true);
  expect(mockUpsert).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ error: new Error('Offline') }); await pending; });
  expect(hook.result.current.completed.has('loose')).toBe(false);
  expect(hook.result.current.error).toBeTruthy();
  await act(async () => { await hook.result.current[action]('loose'); });
  expect(hook.result.current.completed.has('loose')).toBe(true);
  expect(mockUpsert).toHaveBeenCalledTimes(2);
});

it('the last stack member gets the group confirmation; a loose tick gets the single confirmation', async () => {
  const hook = await renderHook(useHabits, { wrapper });
  await act(async () => { await hook.result.current.toggleAct('member'); });
  expect(haptics.stackComplete).toHaveBeenCalledTimes(1);
  await act(async () => { await hook.result.current.toggleLoose('loose'); });
  expect(haptics.completed).toHaveBeenCalledTimes(2);
  expect(haptics.stackComplete).toHaveBeenCalledTimes(1);
  expect(mockCelebrate).not.toHaveBeenCalled();
});

it('keeps two pending creates distinct even when they start in the same millisecond', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1234);
  const finish: (() => void)[] = [];
  mockInsert.mockImplementation((rows) => new Promise((resolve) => {
    finish.push(() => resolve({ data: rows.map((row) => habit(String(row.name))), error: null }));
  }));
  try {
    const hook = await renderHook(useHabits, { wrapper });
    let creates!: Promise<Habit[]>[];
    await act(async () => {
      creates = ['first', 'second create'].map((name) => hook.result.current.createHabits([{ name, schedule_days: [0] }]));
    });
    const ids = hook.result.current.habits.filter((h) => h.id.startsWith('temp-')).map((h) => h.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    await act(async () => { finish.forEach((resolve) => resolve()); await Promise.all(creates); });
  } finally {
    clock.mockRestore();
  }
});

const tracked = (event: string) => mockTrack.mock.calls.filter(([name]) => name === event).map(([, props]) => props);
const deferredWrite = () => {
  let resolve!: (value: WriteResult) => void;
  const promise = new Promise<WriteResult>((yes) => { resolve = yes; });
  return { promise, resolve };
};

it('counts a Habit Completed only once the tick is saved, and once per habit-day', async () => {
  const write = deferredWrite();
  mockUpsert.mockReturnValueOnce(write.promise);
  const hook = await renderHook(useHabits, { wrapper });
  let tick!: Promise<void>;
  await act(async () => { tick = hook.result.current.toggleLoose('loose'); });
  expect(tracked(ANALYTICS_EVENTS.HABIT_COMPLETED)).toEqual([]);
  await act(async () => { write.resolve({ error: null }); await tick; });
  expect(tracked(ANALYTICS_EVENTS.HABIT_COMPLETED)).toEqual([
    { preset: false, count_goal: false, in_stack: false, today: true },
  ]);
  // Taken back and ticked again: the same habit-day, counted once.
  await act(async () => { await hook.result.current.toggleLoose('loose'); });
  await act(async () => { await hook.result.current.toggleLoose('loose'); });
  expect(tracked(ANALYTICS_EVENTS.HABIT_COMPLETED)).toHaveLength(1);
});

it('a tick that fails to save is no completion', async () => {
  mockUpsert.mockResolvedValueOnce({ error: new Error('Offline') });
  const hook = await renderHook(useHabits, { wrapper });
  await act(async () => { await hook.result.current.toggleAct('member'); });
  expect(hook.result.current.completed.has('member')).toBe(false);
  expect(tracked(ANALYTICS_EVENTS.HABIT_COMPLETED)).toEqual([]);
});

it('a count goal is completed by the saved write that meets its target', async () => {
  const hook = await renderHook(useHabits, { wrapper });
  for (let tap = 0; tap < 3; tap++) {
    await act(async () => { await hook.result.current.toggleLoose('counted'); });
    expect(tracked(ANALYTICS_EVENTS.HABIT_COMPLETED)).toHaveLength(tap < 2 ? 0 : 1);
  }
  expect(tracked(ANALYTICS_EVENTS.HABIT_COMPLETED)).toEqual([expect.objectContaining({ count_goal: true })]);
});

it('Habits Added names the screen it came from, and an add with no screen sends nothing', async () => {
  mockInsert.mockImplementation(async (rows) => ({ data: rows.map((row) => habit(String(row.name), { preset_id: null })), error: null }));
  const hook = await renderHook(useHabits, { wrapper });
  await act(async () => { await hook.result.current.createHabits([{ name: 'Read', schedule_days: [0] }], { source: 'editor' }); });
  await act(async () => { await hook.result.current.createHabits([{ name: 'Walk', schedule_days: [0] }]); });
  expect(tracked(ANALYTICS_EVENTS.HABITS_ADDED)).toEqual([{ count: 1, presets: 0, source: 'editor' }]);
});

it('Stack Created is sent for a stack the user set out to make, by its source alone', async () => {
  mockInsert.mockImplementation(async () => ({ data: [], error: null }));
  const hook = await renderHook(useHabits, { wrapper });
  await act(async () => { await hook.result.current.createStack('Morning', [], { moment: null, source: 'own' }); });
  await act(async () => { await hook.result.current.createStack('Evening', [], { moment: null }); });
  expect(tracked(ANALYTICS_EVENTS.STACK_CREATED)).toEqual([{ source: 'own' }]);
});

it('Habit Skipped is sent once the skip is saved, and not for taking one back', async () => {
  const hook = await renderHook(useHabits, { wrapper });
  await act(async () => { await hook.result.current.skipHabit('member'); });
  await act(async () => { await hook.result.current.skipHabit('member'); });
  expect(tracked(ANALYTICS_EVENTS.HABIT_SKIPPED)).toEqual([{ in_stack: true, today: true }]);
});

it('registers the habit_count bucket once the habits are in', async () => {
  await renderHook(useHabits, { wrapper });
  expect(mockRegister).toHaveBeenCalledWith({ habit_count: '4-9' });
  expect(mockRegister).not.toHaveBeenCalledWith({ habit_count: '0' });
});
