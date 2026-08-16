export type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  /** Web Storage's own removal. Needed by the note draft, which must be *gone* once its note is
   *  saved — an empty string left in its slot would read at launch as an interrupted sitting. */
  removeItem: (key: string) => void;
};

/**
 * The synchronous SQLite-backed Web Storage shim (`expo-sqlite/localStorage/install`) that the
 * habits/tasks snapshots, the catalog cache, and the preferences store all read from, so their
 * seeds are readable on the very first render without an async hop. `undefined` before the shim
 * has installed, or in a test host, where there is none at all — callers must degrade to their
 * defaults rather than throw.
 */
export function getWebStorage(): WebStorageLike | undefined {
  return (globalThis as unknown as { localStorage?: WebStorageLike }).localStorage;
}
