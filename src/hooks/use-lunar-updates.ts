/**
 * Keeps the OS schedule of lunar updates in step with the user's actual month.
 *
 * A local notification freezes its text the moment it is armed, which here is a feature rather
 * than a limitation: completions only ever happen inside the app, and the month's denominator
 * is the whole month rather than month-to-date — so degrees computed when the app was last open
 * are still exactly right when the notification fires days later. What that does demand is a
 * re-arm whenever the figure has moved, which is what this hook is.
 *
 * The quarterly reading each update carries rests on the same argument, and needs it in one more
 * place: a quarter is measured against everything the WHOLE quarter asks, days not yet lived
 * included. So a reading baked mid-quarter is still exactly right on the night it fires unless
 * something was completed in between — and completing re-arms. A milestone armed before its
 * quarter has even begun simply has no reading to carry, and falls back to the landmark.
 *
 * Lives beside {@link useHabits} rather than inside it: that provider is long enough already,
 * and the only thing this needs from it is a user, a day, and a hint that something was ticked.
 */
import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';

import { deviceLocation } from '@/lib/geo';
import { loadGoalReadings } from '@/lib/goal-readings';
import type { Reading } from '@/lib/insights';
import { loadProgress } from '@/lib/load-progress';
import { planLunarFires } from '@/lib/lunar-schedule';
import { lunarUpdateCopy, type GoalAsk } from '@/lib/lunar-update';
import { notificationsAvailable, scheduleLunarUpdates } from '@/lib/notifications';
import { usePreference } from '@/lib/preferences';
import type { MonthProgress } from '@/lib/progress';

type Args = {
  userId: string | null;
  /** The live local day — re-arms across a midnight rollover. */
  today: string;
  /** Ids already ticked for `today`, so a write still in flight doesn't undercount the month. */
  doneToday: string[];
  /** True during the first load; arming from an empty habit list would schedule a wrong figure. */
  loading: boolean;
  /**
   * Any cheap value that moves when the month's completion does. Deliberately not an effect
   * dependency — re-fetching progress on every tick would be absurd. It is read at the moment
   * the app goes to the background, to decide whether a re-arm is owed at all.
   */
  progressKey: string;
};

async function arm(userId: string, today: string, doneToday: string[], signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  const { lat, lon } = deviceLocation();
  const fires = planLunarFires(today, lat, lon);
  if (fires.length === 0) {
    await scheduleLunarUpdates([]); // no Islamic calendar on this runtime — nothing to say
    return;
  }
  // These reads are independent; let a missing figure fall back without delaying the other.
  const [progress, goalReadings] = await Promise.allSettled([
    loadProgress(userId, today, doneToday),
    loadGoalReadings(userId, today),
  ]);
  // Cancellation must cover the reads too: the scheduler's own epoch only starts when called.
  if (signal.aborted) return;
  const month: MonthProgress | null = progress.status === 'fulfilled' ? progress.value.month : null;
  const readings: Reading[] = progress.status === 'fulfilled' ? progress.value.readings : [];

  // The goal a new moon speaks for: the nearest horizon among those still asking for something.
  // Read separately from the progress window on purpose — a goal's measure is a lifetime sum, and
  // a windowed one would put a wrong number on a lock screen (see `loadGoalReadings`).
  //
  // The figure is the CLOSING month's ask, since the update is armed before the month it fires in
  // opens — the same approximation the quarterly readings are baked in under, and arming re-runs
  // on every trip to the background, so the number is refreshed right up to the night itself. It
  // errs low rather than high: a month you kept pace with leaves next month's ask about where
  // this one's was, and a month you did not raises it. Understating what is asked is the side to
  // be wrong on.
  let goalAsk: GoalAsk | null = null;
  if (goalReadings.status === 'fulfilled') {
    const goals = goalReadings.value;
    // `overdue` is excluded, and it has to be: `computeGoals` pins a passed horizon's `monthsLeft`
    // to 0 and makes its quota the WHOLE outstanding remainder, so a lapsed goal would both sort
    // ahead of every live one and put its entire nine thousand lines on the lock screen as the
    // month's ask. A goal whose by-when has gone needs a new horizon, not a louder number.
    const nearest = goals
      .filter((reading) => !reading.met && !reading.overdue && reading.quota !== null && reading.quota > 0)
      .sort((a, b) => a.monthsLeft - b.monthsLeft)[0];
    if (nearest?.quota != null) goalAsk = { title: nearest.goal.title, quota: nearest.quota, unit: nearest.goal.unit };
  }

  await scheduleLunarUpdates(
    fires.map((fire) => {
      const { title, body, assetKey, readingId } = lunarUpdateCopy(fire, month, readings, goalAsk);
      return { at: fire.at, title, body, assetKey, readingId };
    }),
  );
}

export function useLunarUpdates({ userId, today, doneToday, loading, progressKey }: Args): void {
  const enabled = usePreference('lunarUpdates');
  // The Hijri adjustment moves which Gregorian evening every milestone falls on, so it has to
  // re-arm exactly as a day rollover does.
  const hijriOffset = usePreference('hijriOffset');

  /** The `progressKey` the armed schedule was built from — `null` while nothing is armed. */
  const armedKey = useRef<string | null>(null);
  const pendingArm = useRef<AbortController | null>(null);

  // Effect Event (non-reactive): reads the latest ids and key without making the
  // effects below depend on values that change on every tick — and without a ref written
  // during render, which is exactly what this hook exists to avoid.
  const rearm = useEffectEvent((onlyIfChanged: boolean) => {
    if (!notificationsAvailable || !enabled || loading || !userId) return;
    if (onlyIfChanged && armedKey.current === progressKey) return; // nothing moved since the last arm
    pendingArm.current?.abort();
    const controller = new AbortController();
    pendingArm.current = controller;
    armedKey.current = progressKey;
    void arm(userId, today, doneToday, controller.signal).catch(() => {
      if (controller.signal.aborted) return;
      armedKey.current = null; // failed — let the next background attempt try again
    });
  });

  // Gated on `loading`: the first commit renders with no habits whenever the cached snapshot is
  // rejected (every new-day launch), and arming from THAT would bake a zero into a month that
  // isn't empty. The `loading` flip re-runs this once the real habits are in.
  useEffect(() => {
    if (!notificationsAvailable) return;
    if (enabled && !loading && userId) rearm(false);
    else void scheduleLunarUpdates([]);
    // Invalidate reads on every lifecycle change, including sign-out/unmount. Clearing the OS
    // schedule also supersedes a rebuild that had already started before this cleanup.
    return () => {
      pendingArm.current?.abort();
      pendingArm.current = null;
      armedKey.current = null;
      void scheduleLunarUpdates([]);
    };
  }, [loading, userId, enabled, today, hijriOffset]);

  // Backgrounding is the last honest moment to bake the figure — the user is done ticking, and
  // everything they did is already in the local state this reads.
  useEffect(() => {
    if (!notificationsAvailable || !userId || !enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') rearm(true);
    });
    return () => sub.remove();
  }, [userId, enabled]);
}
