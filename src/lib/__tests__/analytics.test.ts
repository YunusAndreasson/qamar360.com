/**
 * The analytics service never throws, sends to the EU endpoint, and stays anonymous; the super
 * properties it is given survive `reset`.
 */
import { describe, expect, jest, test } from '@jest/globals';

import { ANALYTICS_EVENTS } from '@/constants/analytics';
import { analytics, errorCode, habitCountBucket, isNewAccount } from '@/lib/analytics';

import type { Mixpanel } from 'mixpanel-react-native';

// jest.mock calls are hoisted above the imports; the service loads Mixpanel lazily on first use.
const mockInit = jest.fn<Mixpanel['init']>(async () => undefined);
const mockTrack = jest.fn<Mixpanel['track']>();
const mockReset = jest.fn<Mixpanel['reset']>();
const mockRegister = jest.fn<Mixpanel['registerSuperProperties']>();
const mockIdentify = jest.fn();
const MockMixpanel = jest.fn((..._args: unknown[]) => ({
  init: mockInit,
  track: mockTrack,
  reset: mockReset,
  registerSuperProperties: mockRegister,
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

  test('the API surface is the one the app uses, and nothing that could identify anyone', () => {
    expect(Object.keys(analytics).sort()).toEqual(
      ['firstOpen', 'register', 'reset', 'track', 'trackOnce', 'trackSignIn', 'trackSignOut', 'trackSignUp'].sort(),
    );
  });

  test('register sends a changed super property once, and an unchanged one not at all', async () => {
    mockRegister.mockClear();
    await analytics.register({ signed_in: true, habit_count: '1-3' });
    await analytics.register({ signed_in: true });
    await analytics.register({ habit_count: '4-9' });
    expect(mockRegister.mock.calls).toEqual([[{ signed_in: true, habit_count: '1-3' }], [{ habit_count: '4-9' }]]);
  });

  test('reset starts a new anonymous id and puts every super property back on it', async () => {
    await analytics.register({ notifications_enabled: false });
    mockRegister.mockClear();
    await analytics.reset();
    expect(mockReset).toHaveBeenCalled();
    expect(mockRegister).toHaveBeenCalledWith({ signed_in: true, habit_count: '4-9', notifications_enabled: false });
    expect(mockRegister.mock.invocationCallOrder[0]).toBeGreaterThan(mockReset.mock.invocationCallOrder.at(-1)!);
  });

  test('SDK failures never reach the caller', async () => {
    mockTrack.mockImplementationOnce(() => {
      throw new Error('track failed');
    });
    mockReset.mockImplementationOnce(() => {
      throw new Error('reset failed');
    });
    mockRegister.mockImplementationOnce(() => {
      throw new Error('register failed');
    });
    await expect(analytics.track(ANALYTICS_EVENTS.DAY_COMPLETED)).resolves.toBeUndefined();
    await expect(analytics.reset()).resolves.toBeUndefined();
    await expect(analytics.register({ signed_in: false })).resolves.toBeUndefined();
  });
});

describe('event helpers', () => {
  test('habit_count buckets', () => {
    expect([0, 1, 3, 4, 9, 10, 40].map(habitCountBucket)).toEqual(['0', '1-3', '1-3', '4-9', '4-9', '10+', '10+']);
  });

  test('a failure is reported by its code, never its message', () => {
    expect(errorCode({ code: 'invalid_credentials', message: 'Invalid login for qa@example.test' })).toBe('invalid_credentials');
    expect(errorCode({ code: 'ERR_REQUEST_FAILED' })).toBe('ERR_REQUEST_FAILED');
    expect(errorCode({ code: 12501 })).toBe('12501');
    expect(errorCode({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe('network');
    expect(errorCode(new Error('Apple did not return an identity token.'))).toBe('unknown');
    expect(errorCode({ code: 'not a code: qa@example.test' })).toBe('unknown');
    expect(errorCode(null)).toBe('unknown');
  });

  test('a social sign-in is a new account when it landed within a minute of the account being created', () => {
    const created = '2026-11-21T10:00:00.000Z';
    expect(isNewAccount({ created_at: created, last_sign_in_at: '2026-11-21T10:00:01.500Z' })).toBe(true);
    expect(isNewAccount({ created_at: created, last_sign_in_at: '2026-11-21T10:05:00.000Z' })).toBe(false);
    expect(isNewAccount({ created_at: created, last_sign_in_at: undefined })).toBe(false);
    expect(isNewAccount({ created_at: 'garbage', last_sign_in_at: created })).toBe(false);
    expect(isNewAccount(null)).toBe(false);
  });
});
