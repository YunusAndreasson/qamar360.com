import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { DAY_MARK_HEIGHT, DayMark, WeekdayLabel, dayAccessibilityLabel } from '@/components/day-mark';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Scale } from '@/constants/motion';
import { Disabled, Pressed, Radius, Spacing } from '@/constants/theme';
import { useDayRecord } from '@/hooks/use-day-record';
import { useTheme } from '@/hooks/use-theme';
import { DATE_LOCALE, WEEK_ORDER } from '@/lib/dates';
import { monthGrid, monthOf, stepMonth, type GridDay } from '@/lib/month-grid';
import { usePreference } from '@/lib/preferences';

/** A cell's height: the day's mark, with room for the selection to sit round it. */
const CELL_HEIGHT = DAY_MARK_HEIGHT + Spacing.three;

/**
 * The Gregorian month the app's days are picked from, each day drawn as Today's week bar draws it:
 * its date inside its orbit, its moon beneath ({@link DayMark}).
 *
 * The OS's own calendar was here, and it counts in Gregorian with no room for anything else. The
 * rest of the app reckons in the Hijri month, which is the moon, so each day carries its phase:
 * reading down a few weeks, the crescent grows to full and back, and where the month turns is
 * plain to see, which is the mapping between the two calendars a date alone never shows. And each
 * day carries its orbit, so the month reads as a record too, and picking a day to go back to shows
 * which days want going back to.
 *
 * Its weeks are the bar's: Saturday to Jumuʿah, so a row of this grid is a week of the bar. The
 * phase comes from the Hijri date, the same rule Today and Progress follow. Days outside
 * `min`…`max` are shown but cannot be picked.
 */
export function MoonCalendar({
  value,
  today,
  min,
  max,
  onChange,
}: {
  value: string;
  today: string;
  min: string;
  max: string;
  onChange: (iso: string) => void;
}) {
  const hijriOffset = usePreference('hijriOffset');
  const { rateOn } = useDayRecord();
  const [shown, setShown] = useState(() => monthOf(value));
  const first = monthOf(min);
  const last = monthOf(max);
  const canBack = shown.year * 12 + shown.month > first.year * 12 + first.month;
  const canForward = shown.year * 12 + shown.month < last.year * 12 + last.month;

  const weeks = monthGrid(shown.year, shown.month);
  const title = new Date(shown.year, shown.month, 1).toLocaleDateString(DATE_LOCALE, { month: 'long', year: 'numeric' });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <MonthStep icon="chevronLeft" label="Previous month" enabled={canBack} onPress={() => setShown(stepMonth(shown, -1))} />
        <ThemedText type="rowTitle" accessibilityRole="header" style={styles.title}>
          {title}
        </ThemedText>
        <MonthStep icon="chevronRight" label="Next month" enabled={canForward} onPress={() => setShown(stepMonth(shown, 1))} />
      </View>

      <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEK_ORDER.map((weekday) => (
          <View key={weekday} style={styles.weekday}>
            <WeekdayLabel weekday={weekday} />
          </View>
        ))}
      </View>

      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((slot, i) =>
            slot ? (
              <DayCell
                key={slot.iso}
                slot={slot}
                selected={slot.iso === value}
                today={today}
                rate={rateOn(slot.iso)}
                enabled={slot.iso >= min && slot.iso <= max}
                hijriOffset={hijriOffset}
                onPress={() => onChange(slot.iso)}
              />
            ) : (
              <View key={`blank-${i}`} style={styles.cell} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/** One of the two month arrows. Disabled past the range rather than hidden, so the title holds still. */
function MonthStep({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: 'chevronLeft' | 'chevronRight';
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={!enabled}
      scaleTo={Scale.glyph}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      style={[styles.step, !enabled && styles.disabled]}>
      <AppIcon name={icon} size={18} color={theme.accent} />
    </PressableScale>
  );
}

function DayCell({
  slot,
  selected,
  today,
  rate,
  enabled,
  hijriOffset,
  onPress,
}: {
  slot: GridDay;
  selected: boolean;
  today: string;
  rate: number | null | undefined;
  enabled: boolean;
  hijriOffset: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={dayAccessibilityLabel(slot.iso, { today, rate, hijriOffset })}
      accessibilityState={{ selected, disabled: !enabled }}
      style={({ pressed }) => [
        styles.cell,
        selected && { backgroundColor: theme.backgroundSelected },
        pressed && styles.pressed,
        !enabled && styles.disabled,
      ]}>
      {/* The picked day carries the selection behind its whole mark, orbit and moon, so the
          selection and today's accent date never compete for the same mark. */}
      <DayMark
        iso={slot.iso}
        rate={rate}
        ahead={slot.iso > today}
        isToday={slot.iso === today}
        selected={selected}
        hijriOffset={hijriOffset}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.one },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two },
  title: { flex: 1, textAlign: 'center' },
  step: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, alignItems: 'center', paddingBottom: Spacing.one },
  cell: {
    flex: 1,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.button,
  },
  pressed: { opacity: Pressed.dim },
  disabled: { opacity: Disabled },
});
