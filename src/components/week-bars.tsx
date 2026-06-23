import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { WeekDay } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { formatDayHeader, weekdayInitial } from '@/lib/dates';

const CHART_HEIGHT = 120;
const BAR_WIDTH = 12;
/** A small visible nub so "a little done" never reads the same as "nothing done". */
const MIN_FILL = 4;

/**
 * Seven-day completion bar chart (today rightmost, highlighted). Each bar's
 * height is that day's completion fraction over a visible empty track, with a
 * weekday letter beneath — labelled axes, not a bare ring.
 */
export function WeekBars({ days }: { days: WeekDay[] }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {days.map((day) => {
        const fillHeight =
          day.fraction > 0 ? Math.max(MIN_FILL, Math.round(day.fraction * CHART_HEIGHT)) : 0;
        return (
          <View
            key={day.iso}
            style={styles.column}
            accessible
            accessibilityLabel={`${formatDayHeader(day.iso)}: ${day.completed} of ${day.possible} habits done`}>
            <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
              <View
                style={[
                  styles.fill,
                  { height: fillHeight, backgroundColor: theme.accent, opacity: day.isToday ? 1 : 0.55 },
                ]}
              />
            </View>
            <ThemedText
              type="small"
              style={[styles.label, { color: theme.textSecondary }, day.isToday && styles.todayLabel]}>
              {weekdayInitial(day.iso)}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  column: { flex: 1, alignItems: 'center', gap: Spacing.one },
  track: {
    width: BAR_WIDTH,
    height: CHART_HEIGHT,
    borderRadius: BAR_WIDTH / 2,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: { width: '100%', borderRadius: BAR_WIDTH / 2 },
  label: { textAlign: 'center' },
  todayLabel: { fontWeight: '700' },
});
