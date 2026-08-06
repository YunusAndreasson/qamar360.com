import 'expo-sqlite/localStorage/install';

import type { Task } from '@/lib/tasks';

/**
 * A last-known snapshot of the day's tasks, persisted so a cold start paints the TO DO section on
 * the first frame — the same availability-first pattern {@link import('./habits-cache')} uses for
 * the day's stacks. Kept in its own key rather than folded into the habits snapshot because the
 * two are written by different providers on different clocks, and one writing a half-loaded copy
 * of the other's state is exactly the bug that pattern exists to avoid.
 *
 * Without it the section pops in *above* the stacks a beat after launch, shoving the whole day
 * down — the one place in the app where a late arrival moves content the reader is already
 * looking at.
 *
 * `day` is the local `YYYY-MM-DD` the rows were fetched for; the seed is only trusted when it is
 * still today, so a rolled-over launch (or one taken while browsing a past day) starts empty and
 * waits for the fetch. `userId` scopes it to its owner, so one account never flashes another's list.
 */
export type TasksSnapshot = {
  userId: string;
  day: string;
  tasks: Task[];
};

const CACHE_KEY = 'tasks.snapshot.v1';

// The synchronous SQLite-backed Web Storage shim (same one the habits snapshot, catalog, auth
// session and theme use), so the snapshot is readable on the very first render with no async hop.
type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};
const storage = (globalThis as unknown as { localStorage?: WebStorageLike }).localStorage;

export function readTasksSnapshot(): TasksSnapshot | null {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as TasksSnapshot) : null;
  } catch {
    return null; // corrupt/unavailable cache — the provider simply starts empty
  }
}

export function writeTasksSnapshot(snapshot: TasksSnapshot): void {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Best-effort cache; ignore quota/serialisation failures.
  }
}
