/**
 * The day's close — the one rule that decides whether everything the day asked for is done.
 *
 * It lives here, outside the providers, for two reasons. First, both completion gestures feed it
 * (sealing a stack and holding an exchange), plus ticking the last task, and the three must never
 * disagree about whether the day just ended. Second, jest here matches `src/**\/*.test.ts` only —
 * inside `use-habits.tsx` this rule had no test at all.
 */

import { hijriMonthRange, hijriParts, scheduledOn, type HijriSchedule } from '@/lib/dates';
import { moonIllumination } from '@/lib/moon';

/** The habit fields the rule reads — `Habit` satisfies this structurally. */
export type ClosableHabit = {
  id: string;
  created_at: string | null;
  schedule_days: number[];
  hijri_schedule?: HijriSchedule | null;
};

export type DayClose = { dayComplete: boolean; doneIds: string[] };

/**
 * Would `day` be fully closed once `justDoneIds` land? Pure.
 *
 * `justDoneIds` are the habits being marked done right now, read as done here before their
 * optimistic state has propagated (the stale-read guard every completion path needs).
 *
 * `openTasks` is how many one-off tasks are still open on that day *after* the tick being
 * considered. An open task holds the day back — a day with something left on its list isn't
 * finished — but it can never close one on its own: the `openIds.length > 0` guard means the
 * celebration still belongs to the practice, and a day with no practice at all raises nothing.
 */
export function dayCloseAfter(
  habits: ClosableHabit[],
  skipped: Set<string>,
  completed: Set<string>,
  justDoneIds: Set<string>,
  day: string,
  openTasks: number,
): DayClose {
  const openIds = habits.filter((h) => scheduledOn(h, day) && !skipped.has(h.id)).map((h) => h.id);
  const dayComplete =
    openIds.length > 0 && openTasks === 0 && openIds.every((id) => justDoneIds.has(id) || completed.has(id));
  // When complete, `openIds` are exactly the day's done (non-skipped, all ticked) ids — handed to
  // the overlay so its degrees count the just-made ticks before they reach the server (matches
  // Progress). Tasks are absent by design: they earn no degrees.
  return { dayComplete, doneIds: dayComplete ? openIds : [] };
}

/**
 * Tonight's moon illumination (0–1) for a local date, so the celebratory haptic can carry the
 * weight of the moon. `undefined` when the runtime has no Islamic calendar — the haptic then falls
 * back to its default beat. Lives beside the rule because both gestures that can close a day (the
 * seal and a task's tick) reach for it at exactly this moment.
 */
export function moonLitFor(iso: string): number | undefined {
  const parts = hijriParts(iso);
  const range = hijriMonthRange(iso);
  if (!parts || !range) return undefined;
  return moonIllumination(parts.day, range.length).illumination;
}

/**
 * How many tasks are open on a day — published by the tasks provider, read by the habits one.
 *
 * A seal happens inside `HabitsProvider`, which is the *parent* of `TasksProvider` (the tasks
 * provider needs the viewed day, so it has to sit underneath), and a parent cannot read a child's
 * context. The count is only ever wanted imperatively, at the instant of a tick — never rendered —
 * so a probe registered on mount is enough, and it costs nothing at rest. The reactive direction
 * (the tab badge) reads both contexts side by side in the tabs layout instead.
 *
 * Defaults to "no open tasks", so a tree without a tasks provider — a test, an early render —
 * behaves exactly as the app did before tasks existed.
 */
type OpenTasksProbe = (day: string) => number;
const NO_TASKS: OpenTasksProbe = () => 0;
let probe: OpenTasksProbe = NO_TASKS;

/** Register the probe; returns the unregister to run on unmount. */
export function setOpenTasksProbe(next: OpenTasksProbe): () => void {
  probe = next;
  return () => {
    // Only clear if we're still the registered one — a remount can register before the old
    // provider's cleanup runs, and clearing then would leave the app blind to open tasks.
    if (probe === next) probe = NO_TASKS;
  };
}

/** Open tasks on `day`, per the registered probe. */
export function openTasksOn(day: string): number {
  return probe(day);
}
