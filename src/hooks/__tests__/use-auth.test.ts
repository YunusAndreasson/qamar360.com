/**
 * Sign Up and Sign In are told apart for every method: Apple and Google by whether the sign-in
 * created the account, email by whether Supabase answered with a real new user. And `signed_in`
 * follows the session.
 */
import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { AuthProvider, useAuth } from '@/hooks/use-auth';

type SocialResult = { isNew: boolean } | null;
const mockEvents: { name: string; method?: string }[] = [];
const mockRegister = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockSocial = { apple: null as SocialResult, google: null as SocialResult };
type SignUpResult = { data: { user: unknown }; error: null };
const mockSignUp = jest.fn<(...args: unknown[]) => Promise<SignUpResult>>(async () => ({ data: { user: null }, error: null }));
let mockAuthListener: ((event: string, session: unknown) => void) | undefined;

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: async (name: string) => { mockEvents.push({ name }); },
    register: (...args: unknown[]) => mockRegister(...args),
    reset: async () => {},
    trackSignIn: async (method: string) => { mockEvents.push({ name: 'Sign In', method }); },
    trackSignUp: async (method: string) => { mockEvents.push({ name: 'Sign Up', method }); },
    trackSignOut: async () => { mockEvents.push({ name: 'Sign Out' }); },
  },
}));
jest.mock('@/lib/social-auth', () => ({
  signInWithApple: async () => mockSocial.apple,
  signInWithGoogle: async () => mockSocial.google,
}));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: null } }),
  onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
    mockAuthListener = listener;
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
  signUp: (...args: unknown[]) => mockSignUp(...args),
} } }));

const wrapper = ({ children }: { children: ReactNode }) => createElement(AuthProvider, null, children);

beforeEach(() => {
  mockEvents.length = 0;
  mockRegister.mockClear();
});

it.each([
  ['apple', 'signInWithApple'],
  ['google', 'signInWithGoogle'],
] as const)('%s: a sign-in that created the account is a Sign Up, any other a Sign In, a cancel nothing', async (method, action) => {
  const hook = await renderHook(useAuth, { wrapper });
  mockSocial[method] = { isNew: true };
  await act(async () => { await expect(hook.result.current[action]()).resolves.toBe(true); });
  mockSocial[method] = { isNew: false };
  await act(async () => { await hook.result.current[action](); });
  mockSocial[method] = null;
  await act(async () => { await expect(hook.result.current[action]()).resolves.toBe(false); });
  expect(mockEvents).toEqual([{ name: 'Sign Up', method }, { name: 'Sign In', method }]);
});

it('email: an address that is already registered is not a Sign Up', async () => {
  const hook = await renderHook(useAuth, { wrapper });
  mockSignUp.mockResolvedValueOnce({ data: { user: { id: 'stand-in', identities: [] } }, error: null });
  await act(async () => { await hook.result.current.signUp('taken@example.test', 'secret'); });
  expect(mockEvents).toEqual([]);
  mockSignUp.mockResolvedValueOnce({ data: { user: { id: 'new', identities: [{ id: 'identity' }] } }, error: null });
  await act(async () => { await hook.result.current.signUp('new@example.test', 'secret'); });
  expect(mockEvents).toEqual([{ name: 'Sign Up', method: 'email' }]);
});

it('signed_in follows the session', async () => {
  await renderHook(useAuth, { wrapper });
  expect(mockRegister).toHaveBeenCalledWith({ signed_in: false });
  await act(async () => { mockAuthListener?.('SIGNED_IN', { user: { id: 'user' } }); });
  expect(mockRegister).toHaveBeenLastCalledWith({ signed_in: true });
});
