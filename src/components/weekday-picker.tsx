import { StyleSheet, View } from 'react-native';

import { SelectablePill } from '@/components/selectable-pill';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { WEEKDAY_LABELS, WEEKDAY_NAMES, weekOrder } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { usePreference } from '@/lib/preferences';

/**
 * The seven-day row: which weekdays a habit is scheduled on, in the user's own week order
 * (`weekStart`). Shared by the act editor's REPEAT block and the exchange form, so the two can't
 * drift in shape, hit target, or the "pick at least one day" floor.
 *
 * `days` are weekday indices, 0=Sun … 6=Sat, matching `habits.schedule_days`. Controlled over the
 * whole Set — the picker owns the toggle and its selection tick, so no caller can ship the row
 * without the feedback.
 */
export function WeekdayPicker({ days, onChange }: { days: Set<number>; onChange: (days: Set<number>) => void }) {
  const weekStart = usePreference('weekStart');

  const toggle = (day: number) => {
    haptics.selection();
    const next = new Set(days);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange(next);
  };

  return (
    <>
      <View style={styles.days}>
        {weekOrder(weekStart).map((d) => (
          <SelectablePill
            key={d}
            selected={days.has(d)}
            label={WEEKDAY_LABELS[d] ?? ''}
            onPress={() => toggle(d)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: days.has(d) }}
            accessibilityLabel={WEEKDAY_NAMES[d]}
            // Pads the 40pt pill to a ≥44pt effective target; ±2 horizontal stays inside
            // the row's inter-pill gap, so neighbours' slop never overlaps.
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            style={styles.day}
          />
        ))}
      </View>
      {days.size === 0 ? (
        <ThemedText type="small" themeColor="danger" style={styles.hint}>
          Pick at least one day.
        </ThemedText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  day: { width: 40, height: 40, borderRadius: Radius.full, paddingHorizontal: 0, paddingVertical: 0 },
  hint: { marginTop: Spacing.one },
});
