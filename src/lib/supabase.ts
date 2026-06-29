import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from '@/lib/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to .env and fill in the values.',
  );
}

// `expo-sqlite/localStorage/install` installs a synchronous Web Storage-compatible
// global `localStorage` backed by SQLite (a no-op on web). This matches the proven
// edenmind-v2 setup exactly — a synchronous storage read so Supabase session
// recovery never depends on an async native bridge resolving at launch.
type WebStorageLike = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};
const storage = (globalThis as unknown as { localStorage: WebStorageLike }).localStorage;

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's React Native guidance: drive token auto-refresh by app foreground
// state (on top of `autoRefreshToken`). Stop refreshing in the background,
// resume on return to foreground.
if (AppState.currentState === 'active') {
  void supabase.auth.startAutoRefresh();
}

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
