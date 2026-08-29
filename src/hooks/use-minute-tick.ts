import { useEffect, useState } from 'react';

/** Whether two instants fall in the same wall-clock minute — the tick's own resolution. */
const sameMinute = (a: Date, b: Date): boolean => Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);

/**
 * A `Date` that advances once a minute, aligned to the wall-clock minute boundary.
 *
 * The night sky wheels at 0.25°/minute — sub-pixel on the backdrop — so a per-minute reposition
 * is imperceptible yet keeps the stars honestly *live* (they drift through the night and settle
 * into the next season). The returned Date is reference-stable between ticks, so a `useMemo`
 * keyed on it recomputes the sky only when the minute actually rolls over, not every render.
 *
 * **`enabled` parks the clock, and it is the difference between one sky ticking and four.** The
 * only caller is the screen sky, and under `NativeTabs` every tab is mounted eagerly and never
 * unmounts — so four skies exist for the life of the app while at most one is visible. Each held
 * its own unconditional interval, and each minute all four recomputed the real-sky field and
 * re-rendered a few hundred SVG stars nobody was looking at. Measured on an Android dev build:
 * one such tick cost **1298ms of React render across the four**, ~9.7s after the last touch. The
 * sky's animated layers were already gated on `useOnStage`; this is that same gate finally
 * applied to the clock driving their DATA.
 *
 * Re-entering catches up rather than resuming where it parked: a sky that sat still for an hour
 * must not paint an hour-old star field, and — the reason this is read off a live clock at all —
 * must not keep painting yesterday's Hijri day after midnight.
 *
 * The catch-up rides the timer rather than running in the effect body, because setting state
 * straight from an effect is what `react-hooks/set-state-in-effect` exists to stop. Each firing
 * returns the SAME `Date` when the minute has not actually rolled, so React bails out instead of
 * invalidating every memo keyed on this value — which is what keeps both the first mount and a
 * same-minute return free. Re-arming from `Date.now()` each time also re-aligns to the boundary,
 * so a catch-up tick cannot leave the clock running off-phase the way a fixed interval would.
 */
export function useMinuteTick(enabled = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        setNow((prev) => (sameMinute(prev, new Date()) ? prev : new Date()));
        schedule(60_000 - (Date.now() % 60_000));
      }, delay);
    };
    // Fire at once: on a fresh mount this is a no-op update React discards, and on a return from
    // off stage it is the catch-up. Either way the next firing lands on the minute boundary.
    schedule(0);
    return () => clearTimeout(timer);
  }, [enabled]);
  return now;
}
