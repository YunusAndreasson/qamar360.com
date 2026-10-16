import 'expo-sqlite/localStorage/install';

import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { setHijriOffset } from '@/lib/dates';
import type { DayBands } from '@/lib/sun';
import { getWebStorage } from '@/lib/web-storage';

/**
 * Local app preferences — one table, sane defaults, no provider.
 *
 * Every entry's default IS the behaviour the app had before it was configurable, so an install
 * that never opens Settings is byte-for-byte the app we shipped. Adding a preference is one row
 * in {@link SPEC}: a storage key, a default, and a `parse` that rejects anything else (a corrupt
 * or hand-edited value falls back rather than propagating a bad type into the UI).
 *
 * Persisted through the synchronous SQLite-backed Web Storage shim — the same store the theme
 * preference, the catalog cache, and {@link hints.ts} use. NOT AsyncStorage, which deadlocks
 * release/new-architecture startup. Because reads are synchronous, a preference is available on
 * the very first render: no flash, nothing async gating launch.
 *
 * Shaped as an external store rather than a Context because two consumers aren't React at all —
 * {@link haptics} (a plain object literal) and the Hijri offset inside {@link dates.ts} — and a
 * store lets them read the current value directly instead of threading a provider through
 * modules that have no component to hang it on.
 */

/** Resolved per call rather than captured at module scope: the shim above installs it on import,
 *  and a lazy read can't be tripped by module evaluation order. */
const storage = getWebStorage;

export type ThemePreference = 'light' | 'dark' | 'system';
/** 0 = Sunday, 1 = Monday, 6 = Saturday — the three starts in common use. */
export type WeekStart = 0 | 1 | 6;

const oneOf =
  <T extends string | number>(values: readonly T[]) =>
  (raw: string): T | undefined =>
    (values as readonly unknown[]).includes(raw) ? (raw as T) : undefined;

const bool = (raw: string): boolean | undefined => (raw === '1' ? true : raw === '0' ? false : undefined);

/** Numbers round-trip as their decimal string; the domain check is the whitelist itself. */
const oneOfNumber =
  <T extends number>(values: readonly T[]) =>
  (raw: string): T | undefined =>
    (values as readonly number[]).includes(Number(raw)) ? (Number(raw) as T) : undefined;

/** The four chapter starts, in minutes from local midnight, strictly increasing within a day. */
function parseBands(raw: string): DayBands | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return undefined;
    const b = value as Record<string, unknown>;
    const minutes = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1440 ? v : null);
    const morning = minutes(b.morning);
    const midday = minutes(b.midday);
    const evening = minutes(b.evening);
    const night = minutes(b.night);
    if (morning === null || midday === null || evening === null || night === null) return undefined;
    if (!(morning < midday && midday < evening && evening < night)) return undefined;
    return { morning, midday, evening, night };
  } catch {
    return undefined;
  }
}

type Spec<T> = {
  /** Storage key. `prefs.themePreference` is the one legacy name — kept so existing installs
   *  don't lose the appearance they chose. */
  key: string;
  /** The pre-configurability behaviour. */
  fallback: T;
  /** Storage string → value, or `undefined` when the stored text isn't a legal value. */
  parse: (raw: string) => T | undefined;
  /** Value → storage string. */
  serialize: (value: T) => string;
};

const flag = (key: string, fallback: boolean): Spec<boolean> => ({
  key,
  fallback,
  parse: bool,
  serialize: (v) => (v ? '1' : '0'),
});

const SPEC = {
  /** The user's chosen appearance; `'system'` follows the OS scheme. */
  appearance: {
    key: 'prefs.themePreference',
    fallback: 'system',
    parse: oneOf(['light', 'dark', 'system'] as const),
    serialize: (v) => v,
  } satisfies Spec<ThemePreference>,
  /** Master switch for the app's own haptics; the OS setting still overrides it downward. */
  haptics: flag('prefs.haptics', true),
  /** The day-complete overlay. Its haptic is separate (see {@link haptics.celebrate}). */
  celebrateDay: flag('prefs.celebrateDay', true),
  /** Tilt parallax, meteors, twinkle. OS Reduce Motion still wins — this can only turn motion off. */
  skyMotion: flag('prefs.skyMotion', true),
  /** Which weekday leads the schedule picker and the weekday bars — display order only. */
  weekStart: {
    key: 'prefs.weekStart',
    fallback: 0,
    parse: oneOfNumber([0, 1, 6] as const),
    serialize: String,
  } satisfies Spec<WeekStart>,
  /** Days to shift the Umm al-Qura calendar by, for a locale that sights the moon differently. */
  hijriOffset: {
    key: 'prefs.hijriOffset',
    fallback: 0,
    parse: oneOfNumber([-2, -1, 0, 1, 2] as const),
    serialize: String,
  } satisfies Spec<-2 | -1 | 0 | 1 | 2>,
  /**
   * Master switch for the four lunar-quarter updates — silences them without touching OS
   * permission. A new key rather than the retired `prefs.reminders`: this is a different
   * feature, and inheriting someone's opt-out of per-habit reminders would silence it wrongly.
   */
  lunarUpdates: flag('prefs.lunarUpdates', true),
  /** Custom day-part boundaries, or `null` to follow the real sun (the default). */
  dayBands: {
    key: 'prefs.dayBands',
    fallback: null,
    parse: (raw) => (raw === 'sun' ? null : parseBands(raw)),
    serialize: (v) => (v ? JSON.stringify(v) : 'sun'),
  } satisfies Spec<DayBands | null>,
} as const;

export type PreferenceKey = keyof typeof SPEC;
/** A key's value type, read off its own `parse` — so the table stays the single declaration. */
export type PreferenceValue<K extends PreferenceKey> = Exclude<ReturnType<(typeof SPEC)[K]['parse']>, undefined>;

/** Read-through cache: `useSyncExternalStore` calls `getSnapshot` on every render, and an
 *  uncached read would hit SQLite each time (and, worse, re-parse `dayBands` into a fresh object
 *  identity every render — React would then loop forever reporting a changed snapshot). */
const cache = new Map<PreferenceKey, unknown>();

function read<K extends PreferenceKey>(key: K): PreferenceValue<K> {
  if (cache.has(key)) return cache.get(key) as PreferenceValue<K>;
  const spec = SPEC[key];
  let value = spec.fallback as PreferenceValue<K>;
  try {
    const raw = storage()?.getItem(spec.key);
    if (raw != null) {
      const parsed = (spec.parse as (raw: string) => PreferenceValue<K> | undefined)(raw);
      if (parsed !== undefined) value = parsed;
    }
  } catch {
    // Storage unavailable — the default is always a working answer.
  }
  cache.set(key, value);
  return value;
}

const listeners = new Set<() => void>();

/** The current value of a preference, readable from anywhere (including non-React modules). */
export function getPreference<K extends PreferenceKey>(key: K): PreferenceValue<K> {
  return read(key);
}

/** Persist a new value and notify every subscriber. Best-effort write: a storage failure still
 *  applies for this session rather than silently dropping the user's choice. */
export function setPreference<K extends PreferenceKey>(key: K, value: PreferenceValue<K>): void {
  if (Object.is(read(key), value)) return;
  cache.set(key, value);
  try {
    storage()?.setItem(SPEC[key].key, (SPEC[key].serialize as (v: PreferenceValue<K>) => string)(value));
  } catch {
    // Best-effort persistence; the in-memory value still took effect.
  }
  applySideEffects(key);
  for (const listener of listeners) listener();
}

/** Preferences that live outside React as well as in it, pushed on change (and once at startup by
 *  {@link initPreferences}) so the modules and the OS that hold them stay in step. */
function applySideEffects(key: PreferenceKey): void {
  if (key === 'hijriOffset') setHijriOffset(read('hijriOffset'));
  // The appearance is handed to the OS too, not only to the app's own colours. The JS theme has
  // always followed the in-app choice (`useEffectiveScheme`), but everything the system draws —
  // alerts, the keyboard, native menus and pickers, and on iOS 26 the tab bar itself, whose
  // `blurEffect` the system now ignores — followed the phone's setting instead, so "Dark" on a
  // light phone put light chrome over a dark app. `setColorScheme` overrides the window's style
  // (iOS) and the night mode (Android; MainActivity handles `uiMode`, so nothing restarts), and
  // `useColorScheme` then reports the same answer the preference gives.
  if (key === 'appearance') {
    const appearance = read('appearance');
    Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
  }
}

/** Push every such preference into its module. Called once, before the first render. */
export function initPreferences(): void {
  applySideEffects('hijriOffset');
  applySideEffects('appearance');
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read — re-renders the caller when the preference changes. */
export function usePreference<K extends PreferenceKey>(key: K): PreferenceValue<K> {
  return useSyncExternalStore(subscribe, () => read(key));
}

/** Test seam: drop the read-through cache so the next read re-consults storage. */
export function resetPreferencesCache(): void {
  cache.clear();
  applySideEffects('hijriOffset');
}
