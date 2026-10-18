import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Appearance } from 'react-native';

import { hijriParts } from '@/lib/dates';
import { getPreference, initPreferences, resetPreferencesCache, setPreference } from '@/lib/preferences';

// The app persists through the expo-sqlite Web Storage shim; under Jest there is none, so stand
// an in-memory one up and let the tests exercise the real read/parse/write path rather than the
// storage-unavailable fallback. (The store resolves `localStorage` per call, so installing it
// after the imports is fine.)
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  },
});

beforeEach(() => {
  store.clear();
  resetPreferencesCache();
});

describe('defaults', () => {
  it('is the app as shipped when nothing has been stored', () => {
    expect(getPreference('appearance')).toBe('system');
    expect(getPreference('haptics')).toBe(true);
    expect(getPreference('celebrateDay')).toBe(true);
    expect(getPreference('skyMotion')).toBe(true);
    expect(getPreference('lunarUpdates')).toBe(true);
    expect(getPreference('hijriOffset')).toBe(0);
  });
});

describe('round trip', () => {
  it('persists and reads back each kind of value', () => {
    setPreference('appearance', 'dark');
    setPreference('haptics', false);
    setPreference('hijriOffset', -1);
    setPreference('lunarUpdates', false);

    resetPreferencesCache(); // forget everything in memory — a fresh launch reading storage

    expect(getPreference('appearance')).toBe('dark');
    expect(getPreference('haptics')).toBe(false);
    expect(getPreference('hijriOffset')).toBe(-1);
    expect(getPreference('lunarUpdates')).toBe(false);
  });

  it('keeps the legacy storage key for appearance, so an existing choice survives', () => {
    setPreference('appearance', 'light');
    expect(store.get('prefs.themePreference')).toBe('light');
  });
});

describe('a stored value that isn’t legal', () => {
  it.each([
    ['prefs.themePreference', 'sepia'],
    ['prefs.haptics', 'yes'],
    ['prefs.hijriOffset', '5'], // beyond the ±2 any reckoning uses
    ['prefs.lunarUpdates', 'yes'],
  ])('falls back to the default rather than propagating %s=%s', (key, value) => {
    store.set(key, value);
    resetPreferencesCache();
    expect(getPreference('appearance')).toBe('system');
    expect(getPreference('haptics')).toBe(true);
    expect(getPreference('hijriOffset')).toBe(0);
    expect(getPreference('lunarUpdates')).toBe(true);
  });
});

describe('side effects', () => {
  it('pushes the Hijri adjustment into the date layer', () => {
    const base = hijriParts('2026-07-19');
    if (!base) return; // runtime without islamic-umalqura
    setPreference('hijriOffset', 1);
    expect(hijriParts('2026-07-19')).not.toEqual(base);
    setPreference('hijriOffset', 0);
    expect(hijriParts('2026-07-19')).toEqual(base);
  });
});

describe('appearance reaches the OS', () => {
  it('overrides the system scheme with an explicit choice, and hands it back for "system"', () => {
    const set = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    setPreference('appearance', 'dark');
    expect(set).toHaveBeenLastCalledWith('dark');
    setPreference('appearance', 'system');
    expect(set).toHaveBeenLastCalledWith('unspecified');
    set.mockRestore();
  });

  it('applies the stored choice at startup, before the first render', () => {
    store.set('prefs.themePreference', 'light');
    resetPreferencesCache();
    const set = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    initPreferences();
    expect(set).toHaveBeenCalledWith('light');
    set.mockRestore();
  });
});
