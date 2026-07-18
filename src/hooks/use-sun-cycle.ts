import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { deviceLocation } from '@/lib/geo';
import { sunCycleAt, type SunCycle } from '@/lib/sun';

/**
 * The day's two derived sun values — the current {@link DayPart} chapter and the sunset-turned
 * display day ({@link displayDateISO}) — kept live while the screen is up.
 *
 * Checks once a minute (aligned to the wall-clock minute, like {@link useMinuteTick}) but
 * commits state ONLY when a derived value actually changes — about five times a day (four
 * chapter turns + the Maghrib flip) — by returning the previous object identity from the
 * setter otherwise, so React bails out and the consuming screen never re-renders on a plain
 * minute. A foreground return re-checks immediately: iOS suspends timers in the background,
 * so hours away would otherwise leave a stale chapter on screen until the next tick.
 *
 * Location is re-read from the device timezone on every check (cheap), so travel that changes
 * the timezone self-corrects without a restart.
 */
export function useSunCycle(): SunCycle {
  const [cycle, setCycle] = useState<SunCycle>(() => {
    const { lat, lon } = deviceLocation();
    return sunCycleAt(new Date(), lat, lon);
  });

  useEffect(() => {
    const check = () => {
      const { lat, lon } = deviceLocation();
      const next = sunCycleAt(new Date(), lat, lon);
      setCycle((prev) =>
        prev.dayPart === next.dayPart && prev.displayDateISO === next.displayDateISO ? prev : next,
      );
    };
    let interval: ReturnType<typeof setInterval> | undefined;
    // Sync to the next minute boundary first, then tick steadily.
    const timeout = setTimeout(
      () => {
        check();
        interval = setInterval(check, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, []);

  return cycle;
}
