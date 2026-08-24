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

import { loadProgress } from '@/hooks/use-progress';
import { deviceLocation } from '@/lib/geo';
import type { Reading } from '@/lib/insights';
import { planLunarFires } from '@/lib/lunar-schedule';
import { lunarUpdateCopy } from '@/lib/lunar-update';
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

async function arm(userId: string, today: string, doneToday: string[]): Promise<void> {
  const { lat, lon } = deviceLocation();
  const fires = planLunarFires(today, lat, lon);
  if (fires.length === 0) {
    await scheduleLunarUpdates([]); // no Islamic calendar on this runtime — nothing to say
    return;
  }
  let month: MonthProgress | null = null;
  let readings: Reading[] = [];
  try {
    ({ month, readings } = await loadProgress(userId, today, doneToday));
  } catch {
    // The landmark is still true without a figure, and the copy knows how to drop it.
  }
  await scheduleLunarUpdates(
    fires.map((fire) => {
      const { title, body, assetKey, readingId } = lunarUpdateCopy(fire, month, readings);
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

  // Effect Event (stable, non-reactive): reads the latest ids and key without making the
  // effects below depend on values that change on every tick — and without a ref written
  // during render, which is exactly what this hook exists to avoid.
  const rearm = useEffectEvent((onlyIfChanged: boolean) => {
    if (!userId) return;
    if (onlyIfChanged && armedKey.current === progressKey) return; // nothing moved since the last arm
    armedKey.current = progressKey;
    void arm(userId, today, doneToday).catch(() => {
      armedKey.current = null; // failed — let the next background attempt try again
    });
  });

  // Gated on `loading`: the first commit renders with no habits whenever the cached snapshot is
  // rejected (every new-day launch), and arming from THAT would bake a zero into a month that
  // isn't empty. The `loading` flip re-runs this once the real habits are in.
  useEffect(() => {
    // In a build without the native module there is nothing to arm, and `arm` would spend a
    // 370-day progress fetch discovering that.
    if (!notificationsAvailable || loading || !userId) return;
    if (!enabled) {
      armedKey.current = null;
      void scheduleLunarUpdates([]); // silenced without touching the OS permission
      return;
    }
    rearm(false);
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

  // Unmount = leaving the authed tree (sign-out). Clear the schedule: the armed updates quote
  // the previous user's degrees, and they must not surface on the sign-in screen or after
  // someone else signs in. The next provider arms its own once its load lands.
  useEffect(
    () => () => {
      void scheduleLunarUpdates([]);
    },
    [],
  );
}
