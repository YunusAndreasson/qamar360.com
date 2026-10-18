import { afterEach, beforeEach, expect, it } from '@jest/globals';

import { readStoredJSON, writeStoredJSON } from '@/lib/web-storage';

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const install = (value: unknown) => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value });
beforeEach(() => { install(undefined); });
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

it('degrades to a cache miss when storage is unavailable', () => {
  expect(readStoredJSON('snapshot')).toBeNull();
  expect(() => writeStoredJSON('snapshot', { day: '2026-10-18' })).not.toThrow();
});

it('finds storage installed after module loading and round-trips cache values', () => {
  const rows = new Map<string, string>();
  install({ getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, raw: string) => rows.set(key, raw) });
  const snapshot = { userId: 'user', day: '2026-10-18', tasks: [] };
  writeStoredJSON('tasks.snapshot.v2', snapshot);
  expect(readStoredJSON('tasks.snapshot.v2')).toEqual(snapshot);
  expect(readStoredJSON('habits.snapshot.v2')).toBeNull();
  rows.set('tasks.snapshot.v2', '{bad json');
  expect(readStoredJSON('tasks.snapshot.v2')).toBeNull();
});

it('absorbs read, quota and serialization errors', () => {
  const fail = () => { throw new Error('Unavailable'); };
  install({ getItem: fail, setItem: fail });
  expect(readStoredJSON('snapshot')).toBeNull();
  expect(() => writeStoredJSON('snapshot', {})).not.toThrow();
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  expect(() => writeStoredJSON('snapshot', cyclic)).not.toThrow();
});
