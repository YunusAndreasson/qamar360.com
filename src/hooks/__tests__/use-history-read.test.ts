import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCallback, useEffect as mockUseEffect } from 'react';

import { useHistoryRead } from '@/hooks/use-history-read';

let mockToday = '2026-10-18';
jest.mock('@/lib/dates', () => ({ todayLocalISO: () => mockToday }));
// Exercise concurrent mount/focus callers without requiring a mounted navigator.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => mockUseEffect(effect, [effect]),
}));

const load = jest.fn<(userId: string, today: string) => Promise<string[]>>();
const message = 'Could not load history.';
const initial = { userId: 'user' as string | null, scope: 'a' };

function useRead({ userId, scope }: typeof initial) {
  const loader = useCallback((userId: string, today: string) => load(userId, today), []);
  return useHistoryRead(userId, `${userId}:${scope}`, loader, [], message);
}

function deferred() {
  let resolve!: (rows: string[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  load.mockReset();
  mockToday = '2026-10-18';
});

it('shares concurrent mount, focus and refresh requests and clears the first-load gate', async () => {
  const pending = deferred();
  load.mockReturnValue(pending.promise);
  const hook = await renderHook(useRead, { initialProps: initial });
  expect(hook.result.current.loading).toBe(true);
  let refresh!: Promise<void>;
  await act(async () => { refresh = hook.result.current.refresh(); });
  expect(load).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledWith('user', '2026-10-18');
  await act(async () => { pending.resolve(['first']); await refresh; });
  expect(hook.result.current.data).toEqual(['first']);
  expect(hook.result.current.loading).toBe(false);
});

it('keeps successful data and its day on refresh failure, then replaces both on retry', async () => {
  load.mockResolvedValueOnce(['saved']).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(['new']);
  const hook = await renderHook(useRead, { initialProps: initial });
  mockToday = '2026-10-19';
  await act(async () => { await hook.result.current.refresh(); });
  expect(hook.result.current.data).toEqual(['saved']);
  expect(hook.result.current.today).toBe('2026-10-18');
  expect(hook.result.current.error).toBe(message);
  expect(hook.result.current.loading).toBe(false);
  await act(async () => { hook.result.current.dismissError(); });
  expect(hook.result.current.error).toBeNull();
  await act(async () => { await hook.result.current.refresh(); });
  expect(hook.result.current.data).toEqual(['new']);
  expect(hook.result.current.today).toBe('2026-10-19');
});

it.each(['scope', 'user', 'sign out'])(
  'discards an old response after a %s change',
  async (change) => {
    const old = deferred();
    load.mockReturnValueOnce(old.promise).mockResolvedValue(['new']);
    const hook = await renderHook(useRead, { initialProps: initial });
    await hook.rerender({
      userId: change === 'sign out' ? null : change === 'user' ? 'other' : 'user',
      scope: change === 'scope' ? 'b' : 'a',
    });
    await act(async () => { old.resolve(['old']); });
    expect(hook.result.current.data).toEqual(change === 'sign out' ? [] : ['new']);
    expect(hook.result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(change === 'sign out' ? 1 : 2);
  },
);

it.each(['success', 'failure'])(
  'an old A request ending in %s cannot affect a new A request after A → B → A',
  async (outcome) => {
    const oldA = deferred();
    const b = deferred();
    const newA = deferred();
    load.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(newA.promise);
    const hook = await renderHook(useRead, { initialProps: initial });
    await hook.rerender({ ...initial, scope: 'b' });
    await hook.rerender(initial);
    await act(async () => {
      if (outcome === 'success') oldA.resolve(['obsolete']);
      else oldA.reject(new Error('Obsolete error'));
      b.resolve(['obsolete b']);
    });
    expect(hook.result.current.data).toEqual([]);
    expect(hook.result.current.error).toBeNull();
    let refresh!: Promise<void>;
    await act(async () => { refresh = hook.result.current.refresh(); });
    expect(load).toHaveBeenCalledTimes(3);
    await act(async () => { newA.resolve(['current']); await refresh; });
    expect(hook.result.current.data).toEqual(['current']);
  },
);

it('does not read while signed out', async () => {
  const hook = await renderHook(useRead, { initialProps: { ...initial, userId: null } });
  expect(load).not.toHaveBeenCalled();
  expect(hook.result.current.loading).toBe(false);
});

it('can retry a loader that throws before returning a promise', async () => {
  load.mockImplementationOnce(() => { throw new Error('Synchronous failure'); }).mockResolvedValueOnce(['retried']);
  const hook = await renderHook(useRead, { initialProps: initial });
  expect(hook.result.current.error).toBe(message);
  await act(async () => { await hook.result.current.refresh(); });
  expect(hook.result.current.data).toEqual(['retried']);
  expect(hook.result.current.error).toBeNull();
});
