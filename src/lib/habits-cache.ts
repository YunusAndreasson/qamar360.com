import type { Habit, HabitStack } from '@/hooks/use-habits';
import { readStoredJSON, writeStoredJSON } from '@/lib/web-storage';

/**
 * A last-known snapshot of the Habits tab, persisted so a cold start paints real content on
 * the first frame instead of a skeleton — availability-first, the same pattern the Sunnah
 * catalog uses (`use-catalog`). The provider revalidates from Supabase immediately on mount,
 * so the seed only fills the gap between launch and the first server response.
 *
 * `day` is the local `YYYY-MM-DD` the completion sets belong to (the viewed day when the
 * snapshot was written). The seed is only trusted when `day` still equals today, so a
 * rolled-over launch — or one taken while browsing a backfilled past day — falls back to the
 * skeleton rather than painting stale ticks. Habits/stacks are structural (date-independent),
 * but we gate the whole seed on the date for simplicity and to never show a half-filled day.
 *
 * `userId` scopes the snapshot to its owner: after a sign-out and sign-in as a different
 * account the provider ignores a mismatched snapshot, so one user never flashes another's
 * habits before the revalidation lands.
 */
export type HabitsSnapshot = {
  userId: string;
  day: string;
  habits: Habit[];
  stacks: HabitStack[];
  completed: string[];
  skipped: string[];
  counts: [string, number][];
};

// Bumped to v2 for the exchange columns: a v1 row was serialised before `instead_of` existed, so
// seeding from one would read every exchange as `instead_of: undefined` — not an exchange at all
// — and drop it into the legacy "Anchor these" orphan card for the one frame before the
// revalidation lands. Bump this whenever a new `Habit` field decides where a row is rendered.
const CACHE_KEY = 'habits.snapshot.v2';

export const readHabitsSnapshot = () => readStoredJSON<HabitsSnapshot>(CACHE_KEY);
export const writeHabitsSnapshot = (snapshot: HabitsSnapshot) => writeStoredJSON(CACHE_KEY, snapshot);
