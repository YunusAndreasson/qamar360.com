/**
 * What the install remembers across launches and sign-outs: its First Open (and so its
 * `install_date`), and which events it has already sent once (`first_time`, `trackOnce`).
 * Each test gets a fresh copy of the service over its own storage, like a fresh launch.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { ANALYTICS_EVENTS } from '@/constants/analytics';
import type * as AnalyticsModuleNS from '@/lib/analytics';

const mockSent: { event: string; properties: unknown }[] = [];
const mockInits: unknown[] = [];
const mockRegistered: unknown[] = [];

jest.mock('mixpanel-react-native', () => ({
  Mixpanel: class {
    async init(_optOut: boolean, superProperties: unknown) {
      mockInits.push(superProperties);
    }
    track(event: string, properties: unknown) {
      mockSent.push({ event, properties });
    }
    registerSuperProperties(properties: unknown) {
      mockRegistered.push(properties);
    }
    reset() {}
  },
}));

jest.mock('@/constants/analytics', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/constants/analytics'),
  MIXPANEL_TOKEN: 'test-token-123',
}));

jest.mock('@/lib/dates', () => ({ todayLocalISO: () => '2026-11-21' }));
// Each launch re-imports the storage module; its shim install would replace the stub below.
jest.mock('expo-sqlite/localStorage/install', () => ({}));

type AnalyticsModule = typeof AnalyticsModuleNS;

/** A new launch: a fresh service over the same storage. */
const launch = (): AnalyticsModule['analytics'] => {
  let loaded: AnalyticsModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@/lib/analytics') as AnalyticsModule;
  });
  return loaded!.analytics;
};

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let rows: Map<string, string>;

beforeEach(() => {
  rows = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, raw: string) => rows.set(key, raw), removeItem: (key: string) => rows.delete(key) },
  });
  mockSent.length = 0;
  mockInits.length = 0;
  mockRegistered.length = 0;
});

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const sent = (event: string) => mockSent.filter((e) => e.event === event).map((e) => e.properties);

describe('First Open', () => {
  test('a new install sends it once, and its install_date rides every later launch', async () => {
    const first = launch();
    await first.firstOpen(false);
    await first.firstOpen(false);
    expect(sent(ANALYTICS_EVENTS.FIRST_OPEN)).toEqual([{ existing_install: false, install_kind: 'new' }]);
    expect(mockRegistered).toContainEqual({ install_date: '2026-11-21' });

    const next = launch();
    await next.firstOpen(false);
    await next.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });
    expect(sent(ANALYTICS_EVENTS.FIRST_OPEN)).toHaveLength(1);
    expect(mockInits.at(-1)).toEqual({ install_date: '2026-11-21', install_id: expect.any(String) });
  });

  test('an install that already held a session is an update: no install_date, and nothing it does is first', async () => {
    const analytics = launch();
    await analytics.firstOpen(true);
    await analytics.track(ANALYTICS_EVENTS.HABIT_COMPLETED, { today: true });
    expect(sent(ANALYTICS_EVENTS.FIRST_OPEN)).toEqual([{ existing_install: true, install_kind: 'existing' }]);
    expect(sent(ANALYTICS_EVENTS.HABIT_COMPLETED)).toEqual([{ today: true, first_time: false }]);
    await launch().track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });
    const noCohort = { install_id: expect.any(String) };
    expect(mockInits).toEqual([noCohort, noCohort]);
    expect(mockRegistered).not.toContainEqual(expect.objectContaining({ install_date: expect.anything() }));
  });
});

describe('first_time', () => {
  test('marks the first of each core action on the install, across launches, and only those', async () => {
    const analytics = launch();
    await analytics.firstOpen(false);
    await analytics.track(ANALYTICS_EVENTS.HABIT_COMPLETED, { today: true });
    await analytics.track(ANALYTICS_EVENTS.HABIT_COMPLETED, { today: true });
    await analytics.track(ANALYTICS_EVENTS.DAY_COMPLETED, { acts: 3 });
    await analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });
    await launch().track(ANALYTICS_EVENTS.DAY_COMPLETED, { acts: 4 });

    expect(sent(ANALYTICS_EVENTS.HABIT_COMPLETED)).toEqual([
      { today: true, first_time: true },
      { today: true, first_time: false },
    ]);
    expect(sent(ANALYTICS_EVENTS.DAY_COMPLETED)).toEqual([
      { acts: 3, first_time: true },
      { acts: 4, first_time: false },
    ]);
    expect(sent(ANALYTICS_EVENTS.SCREEN_VIEWED)).toEqual([{ screen: '/habits' }]);
  });

  test('survives reset, which only replaces the anonymous id', async () => {
    const analytics = launch();
    await analytics.track(ANALYTICS_EVENTS.STACK_CREATED, { source: 'own' });
    await analytics.reset();
    await analytics.track(ANALYTICS_EVENTS.STACK_CREATED, { source: 'curated' });
    expect(sent(ANALYTICS_EVENTS.STACK_CREATED)).toEqual([
      { source: 'own', first_time: true },
      { source: 'curated', first_time: false },
    ]);
  });
});

test('trackOnce sends once per install and key', async () => {
  const step = { step: 'anchor_prompt', index: 1 };
  await launch().trackOnce(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, step, 'anchor_prompt');
  await launch().trackOnce(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, step, 'anchor_prompt');
  expect(sent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED)).toEqual([step]);
});
