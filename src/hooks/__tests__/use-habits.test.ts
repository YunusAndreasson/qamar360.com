import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { HabitsProvider, useHabits, type Habit } from '@/hooks/use-habits';
import type * as Dates from '@/lib/dates';
import { haptics } from '@/lib/haptics';

type WriteResult = { error: Error | null };
const mockUpsert = jest.fn<(row: unknown) => Promise<WriteResult>>();
const mockDelete = jest.fn<(id: unknown, day: unknown) => Promise<WriteResult>>();
const mockInsert = jest.fn<(rows: Record<string, unknown>[]) => Promise<{ data: Habit[]; error: null }>>();
const mockUser = { id: 'user', email: 'qa@example.test' };
const mockCelebrate = jest.fn();
const mockToast = jest.fn();
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
  from: (table: string) => {
    const filters = new Map<string, unknown>();
    let deleting = false;
    let inserting: Record<string, unknown>[] | null = null;
    const query = {
      select: () => query,
      order: () => query,
      eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
      upsert: (row: unknown) => mockUpsert(row),
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
