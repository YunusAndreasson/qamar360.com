import 'expo-sqlite/localStorage/install';

import { useSyncExternalStore } from 'react';

/**
 * One-shot onboarding flags, persisted through the synchronous SQLite-backed Web Storage shim
 * (the same store the theme preference and catalog cache use — NOT AsyncStorage, which deadlocks
 * release builds). Each flag only ever flips forward: a hint that's done its job stays gone.
 * Exposed to components as a tiny external store, so a flag flipping mid-session (first stack
 * created, then deleted) retires its hint without the hint's screen holding duplicate state.
 */

type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};
const storage = (globalThis as unknown as { localStorage?: WebStorageLike }).localStorage;

/** Set the first time a stack exists for this install — via drag, the a11y action, or sync. */
const STACK_CREATED_KEY = 'prefs.stackCreated';

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether this install has ever seen a stack — gates the Today "drag to stack" hint. */
function stackEverCreated(): boolean {
  try {
    return storage?.getItem(STACK_CREATED_KEY) === '1';
  } catch {
    return false; // unreadable storage — show the hint rather than assume it was seen
  }
}

/** Record that a stack exists, retiring the hint for good (best-effort; safe to call repeatedly). */
export function markStackCreated(): void {
  if (stackEverCreated()) return; // already flipped — nothing to write or announce
  try {
    storage?.setItem(STACK_CREATED_KEY, '1');
  } catch {
    // Best-effort: a failed write just means the hint may show again next launch.
  }
  for (const listener of listeners) listener();
}

/** Reactive read of {@link stackEverCreated} — re-renders the caller when the flag flips. */
export function useStackEverCreated(): boolean {
  return useSyncExternalStore(subscribe, stackEverCreated);
}
