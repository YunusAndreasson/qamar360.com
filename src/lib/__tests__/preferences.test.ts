import { beforeEach, describe, expect, it } from '@jest/globals';

import { hijriParts } from '@/lib/dates';
import { getPreference, resetPreferencesCache, setPreference } from '@/lib/preferences';

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
    expect(getPreference('reminders')).toBe(true);
    expect(getPreference('weekStart')).toBe(0);
    expect(getPreference('hijriOffset')).toBe(0);
    expect(getPreference('defaultReminderTime')).toBe('08:00');
    expect(getPreference('dayBands')).toBeNull(); // follow the sun
  });
});

describe('round trip', () => {
  it('persists and reads back each kind of value', () => {
    setPreference('appearance', 'dark');
    setPreference('haptics', false);
    setPreference('weekStart', 1);
    setPreference('hijriOffset', -1);
    setPreference('defaultReminderTime', '21:30');
    setPreference('dayBands', { morning: 360, midday: 720, evening: 1080, night: 1320 });

    resetPreferencesCache(); // forget everything in memory — a fresh launch reading storage

    expect(getPreference('appearance')).toBe('dark');
    expect(getPreference('haptics')).toBe(false);
    expect(getPreference('weekStart')).toBe(1);
    expect(getPreference('hijriOffset')).toBe(-1);
    expect(getPreference('defaultReminderTime')).toBe('21:30');
    expect(getPreference('dayBands')).toEqual({ morning: 360, midday: 720, evening: 1080, night: 1320 });
  });

  it('keeps the legacy storage key for appearance, so an existing choice survives', () => {
    setPreference('appearance', 'light');
    expect(store.get('prefs.themePreference')).toBe('light');
  });

  it('returns a stable object identity for dayBands across reads', () => {
    // `useSyncExternalStore` compares snapshots by identity: a fresh object per read would
    // report a change on every render and loop.
    setPreference('dayBands', { morning: 300, midday: 700, evening: 1000, night: 1300 });
    expect(getPreference('dayBands')).toBe(getPreference('dayBands'));
  });
});

describe('a stored value that isn’t legal', () => {
  it.each([
    ['prefs.themePreference', 'sepia'],
    ['prefs.haptics', 'yes'],
    ['prefs.weekStart', '3'], // a real weekday, but not one of the three offered
    ['prefs.hijriOffset', '5'], // beyond the ±2 any reckoning uses
    ['prefs.reminderTime', '25:00'],
    ['prefs.dayBands', '{"morning":100}'], // incomplete
    ['prefs.dayBands', 'not json'],
  ])('falls back to the default rather than propagating %s=%s', (key, value) => {
    store.set(key, value);
    resetPreferencesCache();
    expect(getPreference('appearance')).toBe('system');
    expect(getPreference('haptics')).toBe(true);
    expect(getPreference('weekStart')).toBe(0);
    expect(getPreference('hijriOffset')).toBe(0);
    expect(getPreference('defaultReminderTime')).toBe('08:00');
    expect(getPreference('dayBands')).toBeNull();
  });

  it('rejects day bands whose chapters cross', () => {
    store.set('prefs.dayBands', JSON.stringify({ morning: 900, midday: 720, evening: 1080, night: 1320 }));
    resetPreferencesCache();
    expect(getPreference('dayBands')).toBeNull();
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
