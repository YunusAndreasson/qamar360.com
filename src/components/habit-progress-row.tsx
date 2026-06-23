import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DayCell, HabitProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';

const DOT = 12;

/** One habit's last-7-days dot trail with a "done / active-days" count. */
function HabitProgressRowBase({ progress }: { progress: HabitProgress }) {
  const theme = useTheme();

  // done → filled accent · missed → hollow outline · inactive (didn't exist yet) → faint.
  const dotFill = (cell: DayCell) =>
    cell === 'done' ? theme.accent : cell === 'inactive' ? theme.backgroundSelected : 'transparent';

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${progress.name}: ${progress.doneCount} of ${progress.activeDays} days completed this week`}>
      <ThemedText type="default" numberOfLines={1} style={styles.name}>
        {progress.name}
      </ThemedText>
      <View style={styles.trail}>
        <View style={styles.dots}>
          {progress.cells.map((cell, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: dotFill(cell) },
                cell === 'missed' && [styles.hollow, { borderColor: theme.textSecondary }],
              ]}
            />
          ))}
        </View>
        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
          {progress.doneCount}/{progress.activeDays}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: Spacing.two, gap: Spacing.two },
  name: { fontWeight: '600' },
  trail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  hollow: { borderWidth: 1.5 },
});

// Memoized like HabitRow — the list only re-renders when the underlying data changes.
export const HabitProgressRow = memo(HabitProgressRowBase);
