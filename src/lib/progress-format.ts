import { clamp01 } from '@/lib/progress';

/** Completion rates stay in 0–1 units; only the presentation changes. */
export function formatPercent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  const percent = clamp01(rate) * 100;
  if (percent > 0 && percent < 1) return '<1%';
  if (percent < 100 && percent > 99) return '99%';
  return `${Math.round(percent)}%`;
}
