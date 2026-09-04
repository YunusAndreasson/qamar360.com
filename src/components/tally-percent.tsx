import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { useTallyUp } from '@/hooks/use-tally-up';
import { clamp01 } from '@/lib/progress';
import { formatPercent } from '@/lib/progress-format';

export function TallyPercent({ rate }: { rate: number | null }) {
  const target = rate === null ? 0 : Math.floor(clamp01(rate) * 100);
  const shown = useTallyUp(target, Duration.orbit);
  return <ThemedText type="display">{rate === null || target === 0 || shown === target ? formatPercent(rate) : `${shown}%`}</ThemedText>;
}
