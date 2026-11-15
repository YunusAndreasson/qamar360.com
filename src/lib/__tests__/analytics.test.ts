/**
 * The analytics service never throws, sends to the EU endpoint, and stays anonymous.
 */
import { describe, expect, jest, test } from '@jest/globals';

import { ANALYTICS_EVENTS } from '@/constants/analytics';
import { analytics } from '@/lib/analytics';

import type { Mixpanel } from 'mixpanel-react-native';

// jest.mock calls are hoisted above the imports; the service loads Mixpanel lazily on first use.
const mockInit = jest.fn<Mixpanel['init']>(async () => undefined);
const mockTrack = jest.fn<Mixpanel['track']>();
const mockReset = jest.fn<Mixpanel['reset']>();
const mockIdentify = jest.fn();
const MockMixpanel = jest.fn((..._args: unknown[]) => ({
  init: mockInit,
  track: mockTrack,
  reset: mockReset,
  identify: mockIdentify,
}));

jest.mock('mixpanel-react-native', () => ({ Mixpanel: MockMixpanel }));

// Only the token is faked; the real module keeps the event names and the server URL.
jest.mock('@/constants/analytics', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/constants/analytics'),
  MIXPANEL_TOKEN: 'test-token-123',
}));

describe('analytics', () => {
  test('initialises once, without automatic events, against the EU endpoint', async () => {
    await analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/habits' });
    expect(MockMixpanel).toHaveBeenCalledTimes(1);
    expect(MockMixpanel).toHaveBeenCalledWith('test-token-123', false);
    expect(mockInit).toHaveBeenCalledWith(false, {}, 'https://api-eu.mixpanel.com');
    expect(mockTrack).toHaveBeenCalledWith('Screen Viewed', { screen: '/habits' });
  });

  test('auth events carry the method and nothing else, and never identify', async () => {
    await analytics.trackSignIn('apple');
    await analytics.trackSignUp('email');
    await analytics.trackSignOut();
    expect(mockTrack).toHaveBeenCalledWith('Sign In', { method: 'apple' });
    expect(mockTrack).toHaveBeenCalledWith('Sign Up', { method: 'email' });
    expect(mockTrack).toHaveBeenCalledWith('Sign Out', undefined);
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(analytics).not.toHaveProperty('identify');
  });

  test('reset starts a new anonymous id', async () => {
    await analytics.reset();
    expect(mockReset).toHaveBeenCalled();
  });

  test('SDK failures never reach the caller', async () => {
    mockTrack.mockImplementationOnce(() => {
      throw new Error('track failed');
    });
    mockReset.mockImplementationOnce(() => {
      throw new Error('reset failed');
    });
    await expect(analytics.track(ANALYTICS_EVENTS.DAY_COMPLETED)).resolves.toBeUndefined();
    await expect(analytics.reset()).resolves.toBeUndefined();
  });
});
