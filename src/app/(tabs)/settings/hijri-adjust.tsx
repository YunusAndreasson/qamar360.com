import { StyleSheet, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { SelectablePill } from '@/components/selectable-pill';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { describeHijriOffset, hijriParts, todayLocalISO } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { setPreference, usePreference } from '@/lib/preferences';

/** The offsets on offer. Beyond ±2 days no reckoning in use disagrees with Umm al-Qura. */
const OFFSETS = [-2, -1, 0, 1, 2] as const;

/**
 * The Hijri adjustment — a ±2-day shift over the tabular Umm al-Qura calendar, for a place whose
 * moonsighting runs ahead of or behind it.
 *
 * It is a real shift, not a cosmetic one: it moves the displayed date *and* the days a Hijri
 * habit falls on (the White Days, ʿĀshūrāʾ, Ramaḍān), which is the whole point — a habit for a
 * day should arrive on the day the user is actually keeping.
 *
 * The choice is verified, not guessed: today's date under each candidate is shown live beneath
 * the pills, so the user picks by recognising the date they know rather than by reasoning about
 * a sign.
 */
export default function HijriAdjustScreen() {
  const offset = usePreference('hijriOffset');
  // Deliberately re-read after the offset changes: `hijriParts` reflects the new setting the
  // instant it's set (the store clears the parts cache), so the preview is the real answer.
  const parts = hijriParts(todayLocalISO());

  return (
    <FormSheet title="Hijri date" subtitle="Match the calendar your community keeps">
      <View style={styles.pills}>
        {OFFSETS.map((value) => (
          <SelectablePill
            key={value}
            selected={value === offset}
            label={value === 0 ? '0' : value > 0 ? `+${value}` : `−${Math.abs(value)}`}
            onPress={() => {
              if (value === offset) return;
              haptics.selection();
              setPreference('hijriOffset', value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === offset }}
            accessibilityLabel={describeHijriOffset(value)}
            style={styles.pill}
          />
        ))}
      </View>

      <View style={styles.preview}>
        <ThemedText type="rowTitle" style={styles.centered}>
          {parts ? `Today is ${parts.day} ${parts.monthName} ${parts.year}` : 'This device has no Hijri calendar'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          {describeHijriOffset(offset)} · also moves habits scheduled on Hijri days
        </ThemedText>
      </View>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', gap: Spacing.two },
  pill: { flex: 1 },
  preview: { gap: Spacing.half, paddingHorizontal: Spacing.one, paddingBottom: Spacing.two },
  centered: { textAlign: 'center' },
});
