import { StyleSheet, View } from 'react-native';

import { MoonPhase } from '@/components/moon-phase';
import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { MonthProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { moonIllumination } from '@/lib/moon';

/** The hero of the Progress tab: the real moon for today's Hijri date — where we are in the
 *  lunar month. Lunar time only; completion lives in the bars below. Hidden without the
 *  Hijri calendar. */
export function MonthSummary({ month }: { month: MonthProgress | null }) {
  const theme = useTheme();
  if (!month) return null;

  const { monthName, year, dayOfMonth, monthLength } = month;
  const { illumination, waxing } = moonIllumination(dayOfMonth, monthLength);
  const a11y = `${monthName} ${year}, day ${dayOfMonth} of ${monthLength}.`;

  return (
    <StatCard style={styles.card} accessible accessibilityLabel={a11y}>
      <View style={styles.header}>
        <ThemedText type="default" style={styles.title}>
          {monthName} {year}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Day {dayOfMonth} of {monthLength}
        </ThemedText>
      </View>
      <View style={styles.moon}>
        <MoonPhase illumination={illumination} waxing={waxing} size={168} />
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' },
  title: { flex: 1, fontWeight: '600' },
  moon: { alignItems: 'center' },
});
