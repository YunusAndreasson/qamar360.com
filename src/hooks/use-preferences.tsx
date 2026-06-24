import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'prefs.themePreference';

type PreferencesContextValue = {
  /** The user's chosen appearance. `'system'` follows the OS scheme. */
  themePreference: ThemePreference;
  /** Flips true once persisted prefs have loaded, so the splash can wait out a theme flash. */
  hydrated: boolean;
  setThemePreference: (preference: ThemePreference) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Locally-persisted app preferences (the appearance override); modelled on {@link AuthProvider}
 * so the rest of the app reads it through a hook. Backed by AsyncStorage (bundled in Expo Go),
 * so the choice survives a relaunch.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Load the persisted preference once; fall back to the default if unset or unreadable.
    void AsyncStorage.getItem(THEME_KEY)
      .then((value) => {
        if (isThemePreference(value)) setThemePreferenceState(value);
      })
      .catch(() => {
        // Storage unavailable — fall back to the default.
      })
      .finally(() => setHydrated(true));
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      themePreference,
      hydrated,
      setThemePreference(preference) {
        setThemePreferenceState(preference);
        void AsyncStorage.setItem(THEME_KEY, preference);
      },
    }),
    [themePreference, hydrated],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
