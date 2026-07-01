import 'expo-sqlite/localStorage/install';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'prefs.themePreference';

type PreferencesContextValue = {
  /** The user's chosen appearance. `'system'` follows the OS scheme. */
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

// `globalThis.localStorage` is the synchronous SQLite-backed Web Storage shim
// installed by `expo-sqlite/localStorage/install` — read back on first render so
// there's no theme flash and no async dependency gating startup. Matches the
// edenmind-v2 pattern. (The previous `@react-native-async-storage/async-storage`
// version deadlocked app launch in release/new-architecture builds.)
type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};
const storage = (globalThis as unknown as { localStorage?: WebStorageLike }).localStorage;

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredPreference(): ThemePreference {
  try {
    const value = storage?.getItem(THEME_KEY);
    if (isThemePreference(value)) return value;
  } catch {
    // Storage unavailable — fall back to the default.
  }
  return 'system';
}

/**
 * Locally-persisted app preferences (the appearance override). Backed by the
 * synchronous SQLite localStorage shim, so the stored choice is available on the
 * very first render and never blocks the launch.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(readStoredPreference);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      themePreference,
      setThemePreference(preference) {
        setThemePreferenceState(preference);
        try {
          storage?.setItem(THEME_KEY, preference);
        } catch {
          // Best-effort persistence; ignore storage failures.
        }
      },
    }),
    [themePreference],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
