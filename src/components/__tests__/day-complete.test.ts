/**
 * The overlay is where a closed day is counted, once whatever closed it (a tick, a count, a
 * to-do), and where the one-time lunar-updates offer follows the card as it fades.
 */
import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { DayCompleteProvider, useDayComplete } from '@/components/day-complete';

const mockTrack = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockPush = jest.fn();
const mockPrefs: Record<string, unknown> = { celebrateDay: true, appearance: 'system' };
let mockPath = '/habits';
let mockOffer = true;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => mockPath }));
jest.mock('@/lib/analytics', () => ({ analytics: { track: (...args: unknown[]) => mockTrack(...args) } }));
jest.mock('@/lib/notifications', () => ({ shouldOfferLunarUpdates: async () => mockOffer }));
jest.mock('@/lib/preferences', () => ({
  getPreference: (key: string) => mockPrefs[key],
  usePreference: (key: string) => mockPrefs[key],
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('@/lib/load-progress', () => ({ loadProgress: async () => ({ month: null }) }));
jest.mock('@/lib/geo', () => ({ deviceLocation: () => ({ lat: 59.3, lon: 18.1 }) }));
// The card's drawing is beside the point here; Reduce Motion on, so a tap dismisses at once.
jest.mock('@/components/moon-body', () => ({ LargeMoon: () => null, MoonBloomCanvas: () => null }));
jest.mock('@/components/ornament/geometric-backdrop', () => ({ GeometricBackdrop: () => null }));
jest.mock('@/components/fade-in-view', () => ({ FadeInView: ({ children }: { children: ReactNode }) => children }));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
  const { View: AnimatedView } = require('react-native') as typeof import('react-native');
  const curve = () => (t: number) => t;
  return {
    __esModule: true,
    default: { View: AnimatedView },
    Easing: { out: curve, in: curve, inOut: curve, bezier: curve, linear: (t: number) => t, cubic: (t: number) => t, quad: (t: number) => t, sin: (t: number) => t },
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => true,
    useSharedValue: (value: number) => ({ get: () => value, set: () => {} }),
    withDelay: (_delay: number, value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

/** Hands the context out of the tree; the latest render's `celebrate` is the one to call. */
const mockContext = jest.fn((_celebrate: (day: string, doneToday: string[]) => void) => {});
function Probe() {
  mockContext(useDayComplete().celebrate);
  return createElement(View);
}
const celebrate = (day: string, doneToday: string[]) => mockContext.mock.lastCall![0](day, doneToday);

const dayCompleted = () => mockTrack.mock.calls.filter(([name]) => name === 'Day Completed').map(([, props]) => props);

beforeEach(() => {
  mockTrack.mockClear();
  mockPush.mockClear();
  mockPrefs.celebrateDay = true;
  mockPath = '/habits';
  mockOffer = true;
});

const mount = () => render(createElement(DayCompleteProvider, null, createElement(Probe)));

it('counts a closed day once, even when it is reopened and closed again', async () => {
  await mount();
  await act(async () => { celebrate('2026-11-21', ['a', 'b']); });
  await act(async () => { celebrate('2026-11-21', ['a', 'b', 'task']); });
  await act(async () => { celebrate('2026-11-22', ['a']); });
  expect(dayCompleted()).toEqual([{ acts: 2 }, { acts: 1 }]);
});

it('counts the day with the card switched off, and never offers anything then', async () => {
  mockPrefs.celebrateDay = false;
  await mount();
  await act(async () => { celebrate('2026-11-21', ['a']); });
  expect(dayCompleted()).toEqual([{ acts: 1 }]);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
});

it('offers the lunar updates as the card fades, over Today, when they cannot arrive yet', async () => {
  await mount();
  await act(async () => { celebrate('2026-11-21', ['a']); });
  await fireEvent.press(screen.getByRole('alert'));
  expect(mockPush).toHaveBeenCalledWith('/habits/lunar-updates');
});

it.each([
  ['nothing to offer', () => { mockOffer = false; }],
  ['somewhere other than Today', () => { mockPath = '/progress'; }],
])('offers nothing when %s', async (_case, arrange) => {
  arrange();
  await mount();
  await act(async () => { celebrate('2026-11-21', ['a']); });
  await fireEvent.press(screen.getByRole('alert'));
  expect(mockPush).not.toHaveBeenCalled();
});
