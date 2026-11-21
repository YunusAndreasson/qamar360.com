/**
 * The primer sheet: counted as a primed Prompt Shown when it appears, remembered as offered, and
 * answered either by Continue (the OS ask) or by closing it (declined before the OS was asked).
 */
import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { LunarUpdatesSheet } from '@/components/lunar-updates-sheet';

const mockTrack = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockEnsure = jest.fn(async (..._args: unknown[]) => true);
const mockSetLunar = jest.fn();
const mockOffered = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@/lib/analytics', () => ({ analytics: { track: (...args: unknown[]) => mockTrack(...args) } }));
jest.mock('@/lib/notifications', () => ({
  ensurePermission: (...args: unknown[]) => mockEnsure(...args),
  markLunarUpdatesOffered: () => mockOffered(),
  permissionGranted: async () => false,
  setLunarUpdates: (enabled: boolean) => mockSetLunar(enabled),
}));
jest.mock('@/lib/preferences', () => ({ usePreference: () => 'system' }));
// The sheet's chrome and drawings are beside the point here.
jest.mock('@/components/form-sheet', () => ({ FormSheet: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/moon-phase', () => ({ MoonPhase: () => null }));
jest.mock('@/components/app-button', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
  const RN = require('react-native') as typeof import('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
  const React = require('react') as typeof import('react');
  return {
    AppButton: ({ children, onPress }: { children: string; onPress: () => void }) =>
      React.createElement(RN.Pressable, { onPress, accessibilityRole: 'button' }, React.createElement(RN.Text, null, children)),
  };
});

const events = (name: string) => mockTrack.mock.calls.filter(([event]) => event === name).map(([, props]) => props);
const primed = { permission: 'notifications', primed: true, source: 'first_day_completed' };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
});

it('is a primed Prompt Shown, and remembered as offered, the moment it appears', async () => {
  await render(createElement(LunarUpdatesSheet, { source: 'first_day_completed' }));
  expect(events('Permission Prompt Shown')).toEqual([{ ...primed, dialog: 'primer' }]);
  expect(mockOffered).toHaveBeenCalled();
  expect(screen.getByText('Not now')).toBeTruthy();
});

it('Continue asks the OS, primed, and switches the updates on', async () => {
  const sheet = await render(createElement(LunarUpdatesSheet, { source: 'first_day_completed' }));
  await fireEvent.press(screen.getByText('Continue'));
  expect(mockEnsure).toHaveBeenCalledWith({ primed: true, source: 'first_day_completed' });
  expect(mockSetLunar).toHaveBeenCalledWith(true);
  expect(mockBack).toHaveBeenCalled();
  await act(async () => { await sheet.unmount(); await flush(); });
  expect(events('Permission Result')).toEqual([]); // ensurePermission reports its own
});

it('closed without Continue, it was declined before the OS ever asked', async () => {
  const sheet = await render(createElement(LunarUpdatesSheet, { source: 'first_day_completed' }));
  await fireEvent.press(screen.getByText('Not now'));
  expect(mockBack).toHaveBeenCalled();
  await act(async () => { await sheet.unmount(); await flush(); });
  expect(mockEnsure).not.toHaveBeenCalled();
  expect(events('Permission Result')).toEqual([{ ...primed, granted: false, prompted: false }]);
});

it('from Settings there is no "Not now": the user opened it themselves', async () => {
  await render(createElement(View, null, createElement(LunarUpdatesSheet, { source: 'settings' })));
  expect(screen.queryByText('Not now')).toBeNull();
  expect(events('Permission Prompt Shown')).toEqual([{ ...primed, source: 'settings', dialog: 'primer' }]);
});
