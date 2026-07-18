import { StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/field-label';
import { SelectablePill } from '@/components/selectable-pill';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DAY_PARTS, type DayPart } from '@/lib/sun';

/** Plain-English labels for the four day parts (they double as the starter stacks' names). */
const LABELS: Record<DayPart, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
  night: 'Night',
};

/**
 * The stack editors' "TIME OF DAY" anchor picker — four pills, tap the selected one again to
 * clear (an unanchored stack is simply never visited by the sun, so there's no fifth "None"
 * pill to weigh the row down).
 */
export function DayPartPicker({
  value,
  onChange,
}: {
  value: DayPart | null;
  onChange: (value: DayPart | null) => void;
}) {
  return (
    <>
      <FieldLabel style={styles.label}>TIME OF DAY</FieldLabel>
      <View style={styles.row}>
        {DAY_PARTS.map((part) => (
          <SelectablePill
            key={part}
            selected={value === part}
            label={LABELS[part]}
            onPress={() => onChange(value === part ? null : part)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value === part }}
            accessibilityLabel={`${LABELS[part]} time of day`}
            // Pads the pill to a ≥44pt effective target; ±2 horizontal stays inside the row gap.
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            style={styles.pill}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        A small sun rests on this stack during its part of the day.
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: Spacing.four },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  pill: { flexGrow: 1 },
  hint: { marginTop: Spacing.two },
});
