import { afterEach, beforeAll, beforeEach, expect, it, jest } from '@jest/globals';
import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { useLunarUpdates } from '@/hooks/use-lunar-updates';

const mockLoadProgress = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLoadGoals = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSchedule = jest.fn((_updates: unknown) => Promise.resolve());
const mockCopy = jest.fn((..._args: unknown[]) => ({ title: 'Moon', body: 'Landmark', assetKey: 'moon' }));
let mockEnabled = true;
let mockOffset = 0;
let mockBackground: ((state: string) => void) | undefined;

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mockBackground = listener;
      return { remove: () => { mockBackground = undefined; } };
    },
  },
}));
jest.mock('@/lib/geo', () => ({ deviceLocation: () => ({ lat: 0, lon: 0 }) }));
jest.mock('@/lib/load-progress', () => ({ loadProgress: (...args: unknown[]) => mockLoadProgress(...args) }));
jest.mock('@/lib/goal-readings', () => ({ loadGoalReadings: (...args: unknown[]) => mockLoadGoals(...args) }));
jest.mock('@/lib/lunar-schedule', () => ({ planLunarFires: () => [{ at: new Date('2027-01-01') }] }));
jest.mock('@/lib/lunar-update', () => ({ lunarUpdateCopy: (...args: unknown[]) => mockCopy(...args) }));
jest.mock('@/lib/notifications', () => ({
  notificationsAvailable: true,
  scheduleLunarUpdates: (...args: unknown[]) => mockSchedule(args[0]),
}));
jest.mock('@/lib/preferences', () => ({
  usePreference: (name: string) => name === 'lunarUpdates' ? mockEnabled : mockOffset,
}));

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const initial = { userId: 'first-user', today: '2026-09-05', doneToday: [], loading: false, progressKey: '0' };
type Props = Parameters<typeof useLunarUpdates>[0];
function Harness(props: Props) {
  useLunarUpdates(props);
  return null;
}

let renderer: ReactTestRenderer | undefined;
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
beforeEach(() => {
  jest.clearAllMocks();
  mockEnabled = true;
  mockOffset = 0;
  mockLoadGoals.mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

async function mount() {
  await act(async () => { renderer = create(createElement(Harness, initial)); });
}

it.each(['disabled', 'signed out', 'user changed', 'day changed', 'offset changed', 'loading', 'unmounted'])(
  'cannot restore stale notifications after %s while its reads are pending',
  async (change) => {
    const old = deferred();
    mockLoadProgress.mockReturnValueOnce(old.promise).mockReturnValue(new Promise(() => {}));
    await mount();
    let props: Props = initial;
    if (change === 'disabled') mockEnabled = false;
    if (change === 'signed out') props = { ...initial, userId: null };
    if (change === 'user changed') props = { ...initial, userId: 'second-user' };
    if (change === 'day changed') props = { ...initial, today: '2026-09-06' };
    if (change === 'offset changed') mockOffset = 1;
    if (change === 'loading') props = { ...initial, loading: true };
    await act(async () => {
      if (change === 'unmounted') renderer?.unmount();
      else renderer?.update(createElement(Harness, props));
    });
    await act(async () => {
      old.resolve({ month: null });
      mockBackground?.('background');
    });
    expect(mockSchedule).toHaveBeenCalled();
    expect(mockSchedule.mock.calls.every(([updates]) => Array.isArray(updates) && updates.length === 0)).toBe(true);
  },
);

it('starts independent reads together and only schedules the newest overlapping rearm', async () => {
  const old = deferred();
  const fresh = deferred();
  mockLoadProgress.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  await mount();
  // Goals are already loading even though progress has not settled.
  expect(mockLoadGoals).toHaveBeenCalledTimes(1);
  await act(async () => { renderer?.update(createElement(Harness, { ...initial, progressKey: '1' })); });
  await act(async () => { mockBackground?.('background'); });
  await act(async () => { fresh.resolve({ month: null }); });
  expect(mockSchedule).toHaveBeenCalledTimes(1);
  await act(async () => { old.resolve({ month: null }); });
  expect(mockSchedule).toHaveBeenCalledTimes(1);
});

it('still schedules landmark copy when either independent read fails', async () => {
  mockLoadProgress.mockRejectedValue(new Error('Offline'));
  mockLoadGoals.mockRejectedValue(new Error('Offline'));
  await mount();
  expect(mockCopy).toHaveBeenCalledWith(expect.anything(), null, null);
  expect(mockSchedule).toHaveBeenCalledWith([expect.objectContaining({ body: 'Landmark' })]);
});
