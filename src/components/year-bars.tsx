import { StyleSheet, View } from 'react-native';

import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { YearProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';

const CHART_HEIGHT = 72;
const BAR_WIDTH = 8;
/** A small visible nub so "a little done" never reads the same as "nothing done". */
const MIN_FILL = 3;

/**
 * "This year": the twelve Hijri months as a small bar chart — Muharram (left) to
 * Dhul-Hijjah (right). Each bar fills with that month's completion over a faint
 * full-month track; the current month's number is bold, months still to come are empty
 * tracks. The same bar language as the week strip — taller is fuller.
 */
export function YearBars({ year }: { year: YearProgress | null }) {
  const theme = useTheme();
  if (!year) return null;

  const a11y = `This year, ${year.year}: ${year.months
    .filter((m) => m.state !== 'future')
    .map((m) => `${m.monthName} ${Math.round(m.fraction * 100)} percent`)
    .join(', ')}.`;

  return (
    <StatCard style={styles.card} accessible accessibilityLabel={a11y}>
      <View style={styles.header}>
        <ThemedText type="default" style={styles.title}>
          This year
        </ThemedText>
      </View>

      <View style={styles.row}>
        {year.months.map((m) => {
          const fill = m.fraction > 0 ? Math.max(MIN_FILL, Math.round(m.fraction * CHART_HEIGHT)) : 0;
          const isCurrent = m.state === 'current';
          return (
            <View key={m.month} style={styles.column}>
              <View style={styles.track}>
                {/* Faint track — a perfect month; ghostlier before the month has begun. */}
                <View
                  style={[styles.fill, styles.full, { backgroundColor: theme.accent, opacity: m.state === 'future' ? 0.08 : 0.16 }]}
                />
                {fill > 0 ? <View style={[styles.fill, { height: fill, backgroundColor: theme.accent }]} /> : null}
              </View>
              <ThemedText
                type="small"
                style={[
                  styles.label,
                  { color: isCurrent ? theme.accent : theme.textSecondary },
                  isCurrent && styles.current,
                ]}>
                {m.month}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' },
  title: { flex: 1, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.one },
  column: { flex: 1, alignItems: 'center', gap: Spacing.one },
  track: { width: BAR_WIDTH, height: CHART_HEIGHT, borderRadius: BAR_WIDTH / 2, overflow: 'hidden' },
  fill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: BAR_WIDTH / 2 },
  full: { top: 0 },
  label: { textAlign: 'center' },
  current: { fontWeight: '700' },
});
