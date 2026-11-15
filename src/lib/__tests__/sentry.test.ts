/**
 * Sentry starts only in a release build with a DSN, and attaches no user content.
 */
import { afterEach, expect, it, jest } from '@jest/globals';

import type * as SentryLib from '@/lib/sentry';

import type * as SentryModule from '@sentry/react-native';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setTags: jest.fn(),
  reactNavigationIntegration: jest.fn(() => ({ name: 'ReactNavigation' })),
  breadcrumbsIntegration: jest.fn(() => ({ name: 'Breadcrumbs' })),
}));

jest.mock('expo-updates', () => ({
  channel: 'production',
  updateId: 'test-update',
  runtimeVersion: 'test-runtime',
  isEmbeddedLaunch: false,
}));

// eslint-disable-next-line import/first, import/order
import * as Sentry from '@sentry/react-native';

const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const originalDev = __DEV__;

afterEach(() => {
  Object.assign(globalThis, { __DEV__: originalDev });
  if (originalDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  jest.clearAllMocks();
});

/** Re-evaluate the module under each build environment. */
function load() {
  let loaded!: typeof SentryLib;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@/lib/sentry') as typeof SentryLib;
  });
  return loaded;
}

type InitOptions = NonNullable<Parameters<typeof SentryModule.init>[0]>;
const initOptions = (): InitOptions => jest.mocked(Sentry.init).mock.calls[0]![0];

it.each([true, false])('does not initialise without a DSN (development: %s)', (development) => {
  Object.assign(globalThis, { __DEV__: development });
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  expect(load().sentryEnabled).toBe(false);
  expect(Sentry.init).not.toHaveBeenCalled();
});

it('does not send development failures', () => {
  Object.assign(globalThis, { __DEV__: true });
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.com/1';
  expect(load().sentryEnabled).toBe(false);
  expect(Sentry.init).not.toHaveBeenCalled();
});

it('reports release crashes without user content', () => {
  Object.assign(globalThis, { __DEV__: false });
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.com/1';
  expect(load().sentryEnabled).toBe(true);
  const options = initOptions();
  expect(options).toMatchObject({
    dsn: 'https://public@example.com/1',
    environment: 'production',
    tracesSampleRate: 0.1,
    enableNativeCrashHandling: true,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableNetworkBreadcrumbs: false,
    enableCaptureFailedRequests: false,
  });
  // Both unset is the SDK's no-PII mapping; any `dataCollection` starts from collect-everything.
  expect(options).not.toHaveProperty('sendDefaultPii');
  expect(options).not.toHaveProperty('dataCollection');
  expect(options.beforeBreadcrumb!({ category: 'console', message: 'Read Surah al-Kahf' }, {})).toBeNull();
  expect(options.beforeBreadcrumb!({ category: 'navigation', data: { to: '/habits' } }, {})).toEqual({
    category: 'navigation',
    data: { to: '/habits' },
  });
  expect(
    options.beforeSend!(
      {
        type: undefined,
        user: { email: 'private@example.com' },
        request: { url: 'https://example.com' },
        extra: { title: 'private' },
        exception: { values: [{ type: 'Error', value: 'boom' }] },
      },
      {},
    ),
  ).toEqual({ type: undefined, exception: { values: [{ type: 'Error', value: 'boom' }] } });
  expect(Sentry.setTags).toHaveBeenCalledWith(
    expect.objectContaining({ app: 'qamar360', expo_update_id: 'test-update', expo_runtime_version: 'test-runtime' }),
  );
});
