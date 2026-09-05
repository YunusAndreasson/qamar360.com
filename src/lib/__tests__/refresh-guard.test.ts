import { expect, jest, test } from '@jest/globals';

import { createRefreshGuard } from '../refresh-guard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('refresh waits for an optimistic create and reads its persisted row', async () => {
  const guard = createRefreshGuard();
  const load = jest.fn(async () => ['created']);
  const apply = jest.fn();
  guard.begin();
  const refresh = guard.read(load, apply, () => true);
  expect(load).not.toHaveBeenCalled();
  guard.end();
  await refresh;
  expect(apply).toHaveBeenCalledWith(['created']);
});

test('a toggle overlapping a deferred refresh cannot restore its stale row', async () => {
  const guard = createRefreshGuard();
  const first = deferred<string[]>();
  const load = jest.fn<() => Promise<string[]>>().mockReturnValueOnce(first.promise).mockResolvedValue(['done']);
  const apply = jest.fn();
  const refresh = guard.read(load, apply, () => true);
  guard.begin();
  first.resolve(['open']);
  await Promise.resolve();
  expect(apply).not.toHaveBeenCalled();
  guard.end();
  await refresh;
  expect(apply).toHaveBeenCalledTimes(1);
  expect(apply).toHaveBeenCalledWith(['done']);
});

test('a day switch discards the old request and lets the new day finish after a failed write', async () => {
  const guard = createRefreshGuard();
  let day = 'today';
  const oldRead = deferred<string[]>();
  const applyOld = jest.fn();
  const oldRefresh = guard.read(() => oldRead.promise, applyOld, () => day === 'today');
  guard.begin();
  day = 'yesterday';
  const applyNew = jest.fn();
  const newRefresh = guard.read(async () => ['yesterday row'], applyNew, () => day === 'yesterday');
  oldRead.resolve(['today row']);
  // Both success and rollback release the guard in the mutation wrapper's finally.
  guard.end();
  await Promise.all([oldRefresh, newRefresh]);
  expect(applyOld).not.toHaveBeenCalled();
  expect(applyNew).toHaveBeenCalledWith(['yesterday row']);
});

test('a new account invalidates a pending refresh', async () => {
  const guard = createRefreshGuard();
  const response = deferred<string[]>();
  let user = 'one';
  const apply = jest.fn();
  const refresh = guard.read(() => response.promise, apply, () => user === 'one');
  user = 'two';
  response.resolve(['private row']);
  await refresh;
  expect(apply).not.toHaveBeenCalled();
});

test('continuous writes cap retry traffic and allow the caller to show a refresh error', async () => {
  const guard = createRefreshGuard();
  const load = jest.fn(async () => {
    guard.begin();
    guard.end();
    return [];
  });
  const apply = jest.fn();
  await expect(guard.read(load, apply, () => true)).rejects.toThrow('superseded');
  expect(load).toHaveBeenCalledTimes(3);
  expect(apply).not.toHaveBeenCalled();
});
