import { clamp01, toDegrees } from '@/lib/progress';

const FULL_ORBIT = toDegrees(1);

/**
 * A completion rate (0–1) as the whole orbit degrees the app shows — 360° is a month kept — with
 * two honesty guards on the rounding. A rate short of 1 never reads 360°: the full orbit is the
 * moment the moon lights, and rounding must not award it a day early. A rate above 0 never reads
 * 0°: something done is never shown as nothing done.
 */
export function orbitDegrees(rate: number): number {
  const r = clamp01(rate);
  const degrees = toDegrees(r);
  if (r > 0 && degrees === 0) return 1;
  if (r < 1 && degrees === FULL_ORBIT) return FULL_ORBIT - 1;
  return degrees;
}

/** {@link orbitDegrees} as text, and `—` where there is no figure at all (never a fake 0°). */
export function formatDegrees(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${orbitDegrees(rate)}°`;
}
