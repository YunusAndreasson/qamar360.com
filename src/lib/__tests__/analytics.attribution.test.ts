/**
 * Install attribution, as marketer reads it from Mixpanel: `install_id` on every event and kept
 * across launches and `reset`, `Install Attribution` (Android, the Play referrer in 200-character
 * parts) and `Activated`, each once per install and never for an install from before this code.
 *
 * Each `launch` is a fresh copy of the service over the same storage and the same device, as a
 * relaunch is. Plain objects and a class rather than jest.fn, so no mock reset can empty them.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { ANALYTICS_EVENTS } from '@/constants/analytics';
import type * as AnalyticsModuleNS from '@/lib/analytics';

type Call = { kind: 'init' | 'track' | 'register' | 'reset'; event?: string; properties?: unknown };
const mockCalls: Call[] = [];
const mockPlatform = { OS: 'android' };
const mockDevice = {
  referrer: 'utm_source=meta' as string,
  referrerFails: false,
  referrerHangs: false,
  referrerReads: 0,
};

jest.mock('react-native', () => ({ Platform: mockPlatform }));

jest.mock('expo-application', () => ({
  getInstallReferrerAsync: async () => {
    mockDevice.referrerReads += 1;
    if (mockDevice.referrerFails) throw new Error('service unavailable');
    if (mockDevice.referrerHangs) await new Promise(() => undefined);
    return mockDevice.referrer;
  },
}));

jest.mock('mixpanel-react-native', () => ({
  Mixpanel: class {
    async init(_optOut: boolean, superProperties: unknown) {
      mockCalls.push({ kind: 'init', properties: superProperties });
    }
    track(event: string, properties: unknown) {
      mockCalls.push({ kind: 'track', event, properties });
    }
    registerSuperProperties(properties: unknown) {
      mockCalls.push({ kind: 'register', properties });
    }
    reset() {
      mockCalls.push({ kind: 'reset' });
    }
  },
}));

jest.mock('@/constants/analytics', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/constants/analytics'),
  MIXPANEL_TOKEN: 'test-token-123',
}));

jest.mock('@/lib/dates', () => ({ todayLocalISO: () => '2026-11-21' }));
// Each launch re-imports the storage module; its shim install would replace the stub below.
jest.mock('expo-sqlite/localStorage/install', () => ({}));

type Analytics = (typeof AnalyticsModuleNS)['analytics'];

const launch = (): Analytics => {
  let loaded: typeof AnalyticsModuleNS | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@/lib/analytics') as typeof AnalyticsModuleNS;
  });
  return loaded!.analytics;
};

/** A launch the way the root layout runs one: First Open, then the attribution behind it. */
const open = async (existingInstall = false): Promise<Analytics> => {
  const analytics = launch();
  await analytics.firstOpen(existingInstall);
  await analytics.attributeInstall();
  return analytics;
};

const INSTALL_KEY = 'analytics.install.v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let rows: Map<string, string>;
const storage = { readsFail: false, writesFail: false };

beforeEach(() => {
  rows = new Map();
  Object.assign(storage, { readsFail: false, writesFail: false });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => {
        if (storage.readsFail) throw new Error('storage exploded');
        return rows.get(key) ?? null;
      },
      setItem: (key: string, raw: string) => {
        if (storage.writesFail) throw new Error('disk full');
        rows.set(key, raw);
      },
      removeItem: (key: string) => rows.delete(key),
    },
  });
  mockCalls.length = 0;
  mockPlatform.OS = 'android';
  Object.assign(mockDevice, { referrer: 'utm_source=meta', referrerFails: false, referrerHangs: false, referrerReads: 0 });
});

afterEach(() => {
  jest.useRealTimers();
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const tracked = (event: string) => mockCalls.filter((c) => c.kind === 'track' && c.event === event);
const count = (event: string) => tracked(event).length;
const inits = () => mockCalls.filter((c) => c.kind === 'init').map((c) => c.properties as Record<string, unknown>);

describe('install_id', () => {
  test('is a UUID v4, on the super properties Mixpanel starts with, before the launch sends anything', async () => {
    const analytics = launch();
    await analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });

    expect(mockCalls[0]?.kind).toBe('init');
    expect(inits()[0]?.install_id).toMatch(UUID_V4);
  });

  test('is made once per install and kept across launches', async () => {
    await open();
    await launch().track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });
    await launch().track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });

    const ids = inits().map((p) => p.install_id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
  });

  test('is put back after reset (sign-out, account deletion)', async () => {
    const analytics = launch();
    await analytics.track(ANALYTICS_EVENTS.SIGN_OUT);
    const id = inits()[0]?.install_id;
    await analytics.reset();

    const afterReset = mockCalls.slice(mockCalls.findIndex((c) => c.kind === 'reset') + 1);
    expect(afterReset[0]).toEqual({ kind: 'register', properties: expect.objectContaining({ install_id: id }) });
  });

  test('a stored id that is not one is replaced', async () => {
    rows.set('analytics.install-id.v1', 'garbage');
    await launch().track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });

    expect(inits()[0]?.install_id).toMatch(UUID_V4);
  });

  test('unreadable storage makes none, which could replace the one that joins everything', async () => {
    storage.readsFail = true;
    await launch().track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });

    expect(inits()[0]).not.toHaveProperty('install_id');
  });

  test('an id that could not be stored is still the same one all launch', async () => {
    storage.writesFail = true;
    const analytics = launch();
    await analytics.track(ANALYTICS_EVENTS.SIGN_OUT);
    await analytics.reset();

    const registered = mockCalls.filter((c) => c.kind === 'register').at(-1)?.properties as Record<string, unknown>;
    expect(registered.install_id).toBe(inits()[0]?.install_id);
  });

  // The one join between everything Mixpanel knows about an install: handing it to Sentry or the
  // backend would join what they know too. Only the analytics service may hold it.
  test('no module but the analytics service knows it', () => {
    const root = join(__dirname, '..', '..');
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
        return /\.tsx?$/.test(name) ? [path] : [];
      });
    const holders = files(root)
      .filter((path) => /install[_-]id|installId/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path))
      .sort();

    expect(holders).toEqual(['constants/analytics.ts', 'lib/analytics.ts']);
  });
});

describe('First Open', () => {
  test('says install_kind beside the older existing_install', async () => {
    await open(false);
    rows.clear();
    await open(true);

    expect(tracked(ANALYTICS_EVENTS.FIRST_OPEN).map((c) => c.properties)).toEqual([
      { existing_install: false, install_kind: 'new' },
      { existing_install: true, install_kind: 'existing' },
    ]);
  });
});

describe('Install Attribution', () => {
  test('uses the exact names in the contract', async () => {
    await open();

    expect(tracked(ANALYTICS_EVENTS.INSTALL_ATTRIBUTION)).toEqual([
      { kind: 'track', event: 'Install Attribution', properties: { referrer_0: 'utm_source=meta' } },
    ]);
  });

  test('fires once, across calls and relaunches, reading the referrer once', async () => {
    const analytics = await open();
    await analytics.attributeInstall();
    await Promise.all([analytics.attributeInstall(), analytics.attributeInstall()]);
    await open();
    await open();

    expect(count('Install Attribution')).toBe(1);
    expect(mockDevice.referrerReads).toBe(1);
  });

  test('runs only on Android', async () => {
    mockPlatform.OS = 'ios';
    await open();

    expect(count('First Open')).toBe(1);
    expect(count('Install Attribution')).toBe(0);
    expect(mockDevice.referrerReads).toBe(0);
  });

  test('never fires for an install that already held a session', async () => {
    await open(true);
    await open(true);

    expect(count('Install Attribution')).toBe(0);
    expect(mockDevice.referrerReads).toBe(0);
  });

  // An install whose First Open went out before this code: no install_id, no install_kind.
  test('never fires for an install whose First Open predates it', async () => {
    rows.set(INSTALL_KEY, JSON.stringify({ date: '2026-11-10', existing: false }));
    await open();

    expect(count('First Open')).toBe(0);
    expect(count('Install Attribution')).toBe(0);
    expect(mockDevice.referrerReads).toBe(0);
  });

  test('a referrer that cannot be read is tried again next launch, without repeats', async () => {
    mockDevice.referrerFails = true;
    await open();
    expect(count('Install Attribution')).toBe(0);

    mockDevice.referrerFails = false;
    await open();
    await open();

    expect(count('First Open')).toBe(1);
    expect(count('Install Attribution')).toBe(1);
    expect(mockDevice.referrerReads).toBe(2);
  });

  test('an empty referrer sends nothing and is asked for again next launch', async () => {
    mockDevice.referrer = '';
    await open();
    // expo-application stringifies a null referrer, so it arrives as the word itself.
    mockDevice.referrer = 'null';
    await open();
    expect(count('Install Attribution')).toBe(0);

    mockDevice.referrer = 'utm_source=google-play&utm_medium=organic';
    await open();
    expect(tracked('Install Attribution')[0]?.properties).toEqual({ referrer_0: mockDevice.referrer });
  });

  test('is tried on three launches at most, then never again', async () => {
    mockDevice.referrerFails = true;
    for (let i = 0; i < 6; i++) await open();

    mockDevice.referrerFails = false;
    await open();

    expect(mockDevice.referrerReads).toBe(3);
    expect(count('Install Attribution')).toBe(0);
    expect(JSON.parse(rows.get(INSTALL_KEY)!)).toEqual(expect.objectContaining({ installAttributionSent: true }));
  });

  test('a referrer that never answers times out, holds up nothing, and is tried next launch', async () => {
    jest.useFakeTimers();
    mockDevice.referrerHangs = true;
    const analytics = launch();
    await analytics.firstOpen(false);

    const attributing = analytics.attributeInstall();
    await analytics.track(ANALYTICS_EVENTS.HABITS_ADDED, { count: 1, presets: 0, source: 'editor' });
    expect(count('Activated')).toBe(1);

    await jest.advanceTimersByTimeAsync(10_000);
    await attributing;
    expect(count('Install Attribution')).toBe(0);

    mockDevice.referrerHangs = false;
    await open();
    expect(count('Install Attribution')).toBe(1);
  });

  describe('splitting the referrer', () => {
    const parts = () => {
      const properties = (tracked('Install Attribution')[0]?.properties ?? {}) as Record<string, string>;
      return Object.keys(properties)
        .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]))
        .map((key) => ({ key, value: properties[key] ?? '' }));
    };

    test.each([
      ['shorter than a part', 57, 1],
      ['exactly one part', 200, 1],
      ['one over', 201, 2],
      ['exactly two parts', 400, 2],
      ['several parts', 913, 5],
    ])('%s: joining gives back the exact original', async (_label, length, expectedParts) => {
      // Not a repeated character: a part in the wrong place has to show.
      mockDevice.referrer = Array.from({ length }, (_, i) => String(i % 10)).join('');
      await open();

      const split = parts();
      expect(split.map(({ key }) => key)).toEqual(Array.from({ length: expectedParts }, (_, i) => `referrer_${i}`));
      expect(split.map(({ value }) => value).join('')).toBe(mockDevice.referrer);
      // Exactly 200 each, and only the last may be shorter.
      expect(split.slice(0, -1).every(({ value }) => value.length === 200)).toBe(true);
      expect(split.at(-1)!.value.length).toBeLessThanOrEqual(200);
    });

    test('the raw string is neither decoded nor parsed', async () => {
      mockDevice.referrer = 'utm_source=apps.facebook.com&utm_content=%7B%22app%22%3A0%2C%22t%22%3A1%7D&x=a+b%20c';
      await open();

      expect(tracked('Install Attribution')[0]?.properties).toEqual({ referrer_0: mockDevice.referrer });
    });
  });
});

describe('Activated', () => {
  const addHabits = (analytics: Analytics) =>
    analytics.track(ANALYTICS_EVENTS.HABITS_ADDED, { count: 3, presets: 2, source: 'stack_library' });

  test('follows the first Habits Added of a new install, once, across launches', async () => {
    const analytics = await open();
    await analytics.track(ANALYTICS_EVENTS.HABIT_COMPLETED, { today: true });
    expect(count('Activated')).toBe(0);

    await addHabits(analytics);
    await addHabits(analytics);
    await addHabits(await open());

    expect(count('Activated')).toBe(1);
    const order = mockCalls.filter((c) => c.kind === 'track').map((c) => c.event);
    expect(order.indexOf('Activated')).toBe(order.indexOf('Habits Added') + 1);
  });

  test('fires once however the triggers overlap', async () => {
    const analytics = await open();
    await Promise.all([addHabits(analytics), addHabits(analytics), addHabits(analytics)]);

    expect(count('Activated')).toBe(1);
  });

  // Their setup was long ago: there is no activation left to count.
  test('never fires for an install that already held a session', async () => {
    await addHabits(await open(true));

    expect(count('Activated')).toBe(0);
  });

  test('never fires for an install whose First Open predates it', async () => {
    rows.set(INSTALL_KEY, JSON.stringify({ date: '2026-11-10', existing: false }));
    await addHabits(await open());

    expect(count('Activated')).toBe(0);
  });

  test('never fires before the install has had its First Open', async () => {
    await addHabits(launch());

    expect(count('Activated')).toBe(0);
  });

  // Which habits someone keeps says which practice they keep: it stays on the phone. Activated
  // carries nothing of its own, and what rides with it is the install's, not the habits'.
  test('carries no habit data', async () => {
    const analytics = await open();
    await analytics.register({ signed_in: true, habit_count: '1-3' });
    await addHabits(analytics);

    expect(tracked('Activated')).toEqual([{ kind: 'track', event: 'Activated', properties: undefined }]);
    const superKeys = new Set(
      mockCalls
        .filter((c) => c.kind === 'init' || c.kind === 'register')
        .flatMap((c) => Object.keys(c.properties as Record<string, unknown>)),
    );
    expect([...superKeys].sort()).toEqual(['habit_count', 'install_date', 'install_id', 'signed_in']);
  });
});
