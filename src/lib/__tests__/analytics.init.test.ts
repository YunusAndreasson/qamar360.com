/**
 * Mixpanel is initialised once per launch, however many calls arrive first, and a failed
 * initialisation is tried again. Plain functions and a class rather than jest.fn, so no
 * mock reset can empty them.
 */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import type * as AnalyticsModuleNS from '@/lib/analytics';

const mockMixpanel = { constructed: 0, inits: 0, failNextInit: false };

jest.mock('mixpanel-react-native', () => ({
  Mixpanel: class {
    constructor() {
      mockMixpanel.constructed++;
    }
    async init() {
      mockMixpanel.inits++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (mockMixpanel.failNextInit) {
        mockMixpanel.failNextInit = false;
        throw new Error('init failed');
      }
    }
    track() {}
    reset() {}
  },
}));

jest.mock('@/constants/analytics', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/constants/analytics'),
  MIXPANEL_TOKEN: 'test-token-123',
}));

type AnalyticsModule = typeof AnalyticsModuleNS;

/** A fresh copy of the service, so each test starts uninitialised. */
const loadAnalytics = (): AnalyticsModule['analytics'] => {
  let loaded: AnalyticsModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@/lib/analytics') as AnalyticsModule;
  });
  return loaded!.analytics;
};

describe('analytics initialisation', () => {
  beforeEach(() => {
    mockMixpanel.constructed = 0;
    mockMixpanel.inits = 0;
    mockMixpanel.failNextInit = false;
  });

  test('concurrent first calls initialise Mixpanel once', async () => {
    const analytics = loadAnalytics();
    await Promise.all([analytics.trackSignIn('email'), analytics.trackSignOut(), analytics.reset()]);
    expect(mockMixpanel.constructed).toBe(1);
    expect(mockMixpanel.inits).toBe(1);
  });

  test('a failed initialisation is tried again by the next call', async () => {
    const analytics = loadAnalytics();
    mockMixpanel.failNextInit = true;
    await analytics.trackSignOut();
    await analytics.trackSignOut();
    expect(mockMixpanel.inits).toBe(2);
  });
});
