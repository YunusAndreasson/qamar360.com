import 'expo-sqlite/localStorage/install';

import type { Task } from '@/lib/tasks';
import { getWebStorage } from '@/lib/web-storage';

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

// v2: rows gained `plan_id` for plans, which went again on 2026-10-17. A v2 snapshot still carrying
// the field is harmless (nothing reads it), so the key stays rather than dropping everyone's seed.
const CACHE_KEY = 'tasks.snapshot.v2';

const storage = getWebStorage();

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
