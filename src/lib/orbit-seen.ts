import 'expo-sqlite/localStorage/install';

import { toDegrees } from '@/lib/progress';
import { getWebStorage } from '@/lib/web-storage';

/**
 * Where the moon's stripe stood the last time anyone actually looked at it.
 *
 * The Progress tab is mounted from launch and never unmounts, so the stripe used to move while
 * nobody was watching: tick three acts on Today, come back, and it was simply further round, the
 * sweep having played off screen. Remembering what was last SEEN lets the stripe move on arrival
 * instead, from there to here, so what the day added is something you watch happen.
 *
 * Persisted rather than held in memory, so the same holds across launches: a morning's first look
 * starts from where last night's ended. Scoped to the account and the Hijri month, because another
 * user's stripe, or last month's, is not a place this one has been.
 */
type Seen = { key: string; rate: number };

const CACHE_KEY = 'progress.orbitSeen.v1';
// Read lazily: the shim may not have installed when this module is first evaluated.
const storage = getWebStorage;

export function readOrbitSeen(key: string): number | null {
  try {
    const raw = storage()?.getItem(CACHE_KEY);
    if (!raw) return null;
    const seen = JSON.parse(raw) as Partial<Seen>;
    return seen.key === key && typeof seen.rate === 'number' ? seen.rate : null;
  } catch {
    return null; // a corrupt row is a stripe never seen, not a crash
  }
}

export function writeOrbitSeen(key: string, rate: number): void {
  try {
    storage()?.setItem(CACHE_KEY, JSON.stringify({ key, rate } satisfies Seen));
  } catch {
    // Best effort: losing this only means the next arrival sweeps from empty.
  }
}

/** What the stripe does as it comes on stage. */
export type OrbitArrival = {
  /** Where the sweep starts, 0–1. */
  from: number;
  /** It moved on since it was last seen, and is felt as it lands. */
  grew: boolean;
  /** This is the first look at the month closed, so the glint goes round. */
  closes: boolean;
};

/**
 * The arrival, given where the stripe was last seen (`null`: never, this month) and where it is
 * now. `null` when it should simply be there, because nothing has changed since the last look.
 *
 * A first look sweeps from empty. A stripe that moved since sweeps from where it was, which is the
 * whole point. One that moved BACK (an act unticked, or a habit added mid-month, which owes more)
 * sweeps back too, and quietly: a step back is not something to buzz about. Compared in whole
 * degrees, the unit the stripe is read in, so a change too small to see is not played as one.
 */
export function orbitArrival(seen: number | null, rate: number): OrbitArrival | null {
  const now = toDegrees(rate);
  const closes = now === 360 && (seen === null || toDegrees(seen) < 360);
  if (seen === null) return { from: 0, grew: false, closes };
  const was = toDegrees(seen);
  if (was === now) return null;
  return { from: seen, grew: now > was, closes };
}
