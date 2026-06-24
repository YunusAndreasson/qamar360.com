import { StyleSheet, View } from 'react-native';

import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { MonthProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';

const CHART_HEIGHT = 72;
const BAR_WIDTH = 5;
/** A small visible nub so "a little done" never reads the same as "nothing done". */
const MIN_FILL = 3;

/**
 * "This month": every day of the current Hijri month as a bar — day 1 (left) to the last.
 * Each fills with that day's completion over a faint full-day track; today's slot is
 * brighter, days still to come are faint empty tracks. The same bar language as the week,
 * zoomed to the whole month; the header carries the overall %. Hidden without the Hijri
 * calendar.
 */
export function MonthBars({ month }: { month: MonthProgress | null }) {
  const theme = useTheme();
  if (!month) return null;

  const rate = month.thisPossible > 0 ? month.thisDone / month.thisPossible : 0;
  const pct = Math.round(rate * 100);
  const a11y = `This month: ${pct} percent complete, day ${month.dayOfMonth} of ${month.monthLength}.`;

  return (
    <StatCard style={styles.card} accessible accessibilityLabel={a11y}>
      <View style={styles.header}>
        <ThemedText type="default" style={styles.title}>
          This month
        </ThemedText>
      </View>

      <View style={styles.row}>
        {month.days.map((d) => {
          const fill = d.fraction > 0 ? Math.max(MIN_FILL, Math.round(d.fraction * CHART_HEIGHT)) : 0;
          // Past days sit on the faint track; today's slot is brighter ("you are here");
          // days still to come are ghostlier.
          const trackOpacity = d.state === 'future' ? 0.08 : d.state === 'today' ? 0.32 : 0.16;
          return (
            <View key={d.day} style={styles.column}>
              <View style={styles.track}>
                <View style={[styles.fill, styles.full, { backgroundColor: theme.accent, opacity: trackOpacity }]} />
                {fill > 0 ? <View style={[styles.fill, { height: fill, backgroundColor: theme.accent }]} /> : null}
              </View>
              {/* A sparse day axis — 1, every 5th, and the last day (29 or 30). Fixed width +
                  no-wrap so 2-digit days overflow into the empty neighbours instead of stacking. */}
              <ThemedText
                type="small"
                numberOfLines={1}
                style={[styles.label, { color: theme.textSecondary }]}>
                {d.day === 1 || d.day === month.monthLength || d.day % 5 === 0 ? d.day : ''}
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
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', gap: Spacing.one },
  track: { width: BAR_WIDTH, height: CHART_HEIGHT, borderRadius: BAR_WIDTH / 2, overflow: 'hidden' },
  fill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: BAR_WIDTH / 2 },
  full: { top: 0 },
  label: { width: 24, textAlign: 'center' },
});
