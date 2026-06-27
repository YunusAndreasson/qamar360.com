import { StyleSheet, View } from 'react-native';

import { CELL_SIZE, ProgressCell } from '@/components/progress-cell';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { Spacing } from '@/constants/theme';
import type { YearProgress } from '@/hooks/use-progress';
import { toDegrees } from '@/lib/progress';

/**
 * The current Hijri year as a compact moon history: one circle per month, with
 * completion carried by the ring arc; the interior fills only when a month closes at 360.
 */
export function YearBars({ year }: { year: YearProgress | null }) {
  if (!year) return null;

  const a11y = `This Hijri year, ${year.year} H: ${year.months
    .filter((m) => m.state !== 'future')
    .map((m) => `${m.monthName} ${toDegrees(m.fraction)} degrees`)
    .join(', ')}.`;

  return (
    <StatCard style={styles.card} accessible accessibilityLabel={a11y}>
      <StatCardHeader title="This year" trailing={`${year.year} H`} />

      <View style={styles.grid}>
        {year.months.map((month) => (
          <ProgressCell
            key={month.month}
            label={month.month}
            fraction={month.fraction}
            active={month.state === 'current'}
            muted={month.state === 'future'}
            style={styles.cell}
          />
        ))}
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
  },
  cell: { width: '16.666%', minWidth: CELL_SIZE },
});
