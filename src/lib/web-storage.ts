import 'expo-sqlite/localStorage/install';

export type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/**
 * The synchronous SQLite-backed Web Storage shim (`expo-sqlite/localStorage/install`) that the
 * habits/tasks snapshots, the catalog cache, and the preferences store all read from, so their
 * seeds are readable on the very first render without an async hop. May be undefined in a test
 * host — callers must degrade to their defaults rather than throw.
 */
export function getWebStorage(): WebStorageLike | undefined {
  return (globalThis as unknown as { localStorage?: WebStorageLike }).localStorage;
}

/** Best-effort cache reads. Resolve storage per call so module loading order cannot strand a cache. */
export function readStoredJSON<T>(key: string): T | null {
  try {
    const raw = getWebStorage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeStoredJSON(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    if (raw !== undefined) getWebStorage()?.setItem(key, raw);
  } catch {
    // Cache writes must not turn a successful action into a failure.
  }
}
