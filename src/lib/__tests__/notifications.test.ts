/**
 * What the notification transport reports: one Permission Result per ask, a Prompt Shown only
 * when the OS dialog is really coming, the `notifications_enabled` super property after it, a tap
 * counted once with the milestone it marks, and the one-time offer's gate.
 */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  ensurePermission,
  markLunarUpdatesOffered,
  scheduleLunarUpdates,
  setLunarUpdates,
  shouldOfferLunarUpdates,
  subscribeToUpdateTaps,
} from '@/lib/notifications';

type Permission = { status: string; canAskAgain: boolean; ios?: { allowsBadge?: boolean } };
type Response = { notification: { request: { identifier: string; content: { data?: unknown } } } };

const mockTrack = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockRegister = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockPrefs = { lunarUpdates: true };
const mockRows = new Map<string, unknown>();
const mockN = {
  current: { status: 'undetermined', canAskAgain: true } as Permission,
  answer: 'granted',
  lastResponse: null as Response | null,
  listener: undefined as ((response: Response) => void) | undefined,
  scheduled: [] as { content: { data?: unknown } }[],
};

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => mockN.current,
  requestPermissionsAsync: async () => ({ status: mockN.answer }),
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => {},
  deleteNotificationChannelAsync: async () => {},
  AndroidImportance: { DEFAULT: 3 },
  getLastNotificationResponse: () => mockN.lastResponse,
  clearLastNotificationResponse: () => {},
  addNotificationResponseReceivedListener: (listener: (response: Response) => void) => {
    mockN.listener = listener;
    return { remove: () => {} };
  },
  cancelAllScheduledNotificationsAsync: async () => {},
  scheduleNotificationAsync: async (request: { content: { data?: unknown } }) => {
    mockN.scheduled.push(request);
  },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('@/lib/analytics', () => ({
  analytics: { track: (...args: unknown[]) => mockTrack(...args), register: (...args: unknown[]) => mockRegister(...args) },
}));
jest.mock('@/lib/preferences', () => ({
  getPreference: (key: 'lunarUpdates') => mockPrefs[key],
  setPreference: (key: 'lunarUpdates', value: boolean) => {
    mockPrefs[key] = value;
  },
}));
jest.mock('@/lib/web-storage', () => ({
  readStoredJSON: (key: string) => mockRows.get(key) ?? null,
  writeStoredJSON: (key: string, value: unknown) => mockRows.set(key, value),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const tracked = (event: string) => mockTrack.mock.calls.filter(([name]) => name === event).map(([, props]) => props);

beforeEach(() => {
  mockTrack.mockClear();
  mockRegister.mockClear();
  mockRows.clear();
  mockPrefs.lunarUpdates = true;
  mockN.current = { status: 'undetermined', canAskAgain: true };
  mockN.answer = 'granted';
  mockN.lastResponse = null;
  mockN.scheduled = [];
});

describe('ensurePermission', () => {
  test('a first ask shows the OS dialog, and its answer is the result', async () => {
    await expect(ensurePermission({ primed: true, source: 'first_day_completed' })).resolves.toBe(true);
    const context = { permission: 'notifications', primed: true, source: 'first_day_completed' };
    expect(tracked('Permission Prompt Shown')).toEqual([{ ...context, dialog: 'system' }]);
    expect(tracked('Permission Result')).toEqual([{ ...context, granted: true, prompted: true }]);
    await flush();
    expect(mockRegister).toHaveBeenLastCalledWith({ notifications_enabled: false }); // the mock's OS still says undetermined
  });

  test('already allowed: no dialog, a result all the same', async () => {
    mockN.current = { status: 'granted', canAskAgain: false, ios: { allowsBadge: true } };
    await expect(ensurePermission({ primed: false, source: 'settings' })).resolves.toBe(true);
    expect(tracked('Permission Prompt Shown')).toEqual([]);
    expect(tracked('Permission Result')).toEqual([
      { permission: 'notifications', primed: false, source: 'settings', granted: true, prompted: false },
    ]);
    await flush();
    expect(mockRegister).toHaveBeenLastCalledWith({ notifications_enabled: true });
  });

  test('refused for good: the OS cannot ask, so no Prompt Shown, and the result says it did not', async () => {
    mockN.current = { status: 'denied', canAskAgain: false };
    mockN.answer = 'denied';
    await expect(ensurePermission({ primed: false, source: 'settings' })).resolves.toBe(false);
    expect(tracked('Permission Prompt Shown')).toEqual([]);
    expect(tracked('Permission Result')).toEqual([
      { permission: 'notifications', primed: false, source: 'settings', granted: false, prompted: false },
    ]);
  });

  test('denied once on Android, which may still ask again: the dialog is coming', async () => {
    mockN.current = { status: 'denied', canAskAgain: true };
    mockN.answer = 'denied';
    await ensurePermission({ primed: false, source: 'settings' });
    expect(tracked('Permission Prompt Shown')).toHaveLength(1);
    expect(tracked('Permission Result')).toEqual([expect.objectContaining({ granted: false, prompted: true })]);
  });
});

test('notifications_enabled needs both the switch and the OS', async () => {
  mockN.current = { status: 'granted', canAskAgain: false, ios: { allowsBadge: true } };
  setLunarUpdates(false);
  await flush();
  expect(tracked('Lunar Updates Toggled')).toEqual([{ enabled: false }]);
  expect(mockRegister).toHaveBeenLastCalledWith({ notifications_enabled: false });
  setLunarUpdates(true);
  setLunarUpdates(true); // unchanged: nothing to report
  await flush();
  expect(tracked('Lunar Updates Toggled')).toEqual([{ enabled: false }, { enabled: true }]);
  expect(mockRegister).toHaveBeenLastCalledWith({ notifications_enabled: true });
});

describe('the one-time offer', () => {
  test('only while the updates are on, the OS has never been asked, and the sheet never shown', async () => {
    await expect(shouldOfferLunarUpdates()).resolves.toBe(true);
    mockPrefs.lunarUpdates = false;
    await expect(shouldOfferLunarUpdates()).resolves.toBe(false);
    mockPrefs.lunarUpdates = true;
    mockN.current = { status: 'denied', canAskAgain: true };
    await expect(shouldOfferLunarUpdates()).resolves.toBe(false);
    mockN.current = { status: 'undetermined', canAskAgain: true };
    markLunarUpdatesOffered();
    await expect(shouldOfferLunarUpdates()).resolves.toBe(false);
  });
});

test('a tap is counted once, cold or warm, with the milestone it marks', async () => {
  const tap = (id: string, data: unknown): Response => ({ notification: { request: { identifier: id, content: { data } } } });
  mockN.lastResponse = tap('cold', { kind: 'lunar', milestone: 15 });
  const open = jest.fn();
  const unsubscribe = subscribeToUpdateTaps(open);
  await flush();
  mockN.listener?.(tap('cold', { kind: 'lunar', milestone: 15 })); // the same tap, through the other API
  mockN.listener?.(tap('warm', { kind: 'lunar' })); // armed by a build that predates the milestone
  mockN.listener?.(tap('other', { kind: 'something-else' }));
  unsubscribe();
  expect(open).toHaveBeenCalledTimes(2);
  expect(tracked('Notification Opened')).toEqual([
    { type: 'lunar', cold_start: true, milestone: 15 },
    { type: 'lunar', cold_start: false },
  ]);
});

test('an armed update carries its milestone, for the tap to report', async () => {
  mockN.current = { status: 'granted', canAskAgain: false };
  await scheduleLunarUpdates([
    { at: new Date(Date.now() + 86_400_000), title: 'Full moon', body: 'Halfway', assetKey: 'missing', milestone: 15 },
  ]);
  expect(mockN.scheduled.map((request) => request.content.data)).toEqual([{ kind: 'lunar', milestone: 15 }]);
});
