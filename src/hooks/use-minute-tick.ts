import { useEffect, useState } from 'react';

/**
 * A `Date` that advances once a minute, aligned to the wall-clock minute boundary.
 *
 * The night sky wheels at 0.25°/minute — sub-pixel on the backdrop — so a per-minute reposition
 * is imperceptible yet keeps the stars honestly *live* (they drift through the night and settle
 * into the next season). The returned Date is reference-stable between ticks, so a `useMemo`
 * keyed on it recomputes the sky only when the minute actually rolls over, not every render.
 */
export function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    // Sync to the next minute boundary first, then tick steadily.
    const timeout = setTimeout(
      () => {
        setNow(new Date());
        interval = setInterval(() => setNow(new Date()), 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}
