import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { MoonPhase } from '@/components/moon-phase';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Scale } from '@/constants/motion';
import { Disabled, Pressed, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DATE_LOCALE, hijriMonthRange, hijriParts } from '@/lib/dates';
import { phaseOf } from '@/lib/lunar-phase';
import { monthGrid, monthOf, stepMonth, type GridDay } from '@/lib/month-grid';
import { usePreference } from '@/lib/preferences';

/** A day's moon in its cell: small, with the rim, so a new moon still reads as a moon. */
const DAY_MOON = 14;
/** A cell's height: the number over its moon, with room for the selection to sit round both. */
const CELL_HEIGHT = 56;

/**
 * The Gregorian month the app's days are picked from, with each day's moon beneath its number.
 *
 * The OS's own calendar was here, and it counts in Gregorian with no room for anything else. The
 * rest of the app reckons in the Hijri month, which is the moon, so each day carries its phase:
 * reading down a few weeks, the crescent grows to full and back, and where the month turns is
 * plain to see, which is the mapping between the two calendars a date alone never shows.
 *
 * The phase comes from the Hijri date, the same rule Today and Progress follow, so these moons are
 * the moons the rest of the app draws for the same days. Days outside `min`…`max` are shown but
 * cannot be picked.
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
  const weekStart = usePreference('weekStart');
  const hijriOffset = usePreference('hijriOffset');
  const [shown, setShown] = useState(() => monthOf(value));
  const first = monthOf(min);
  const last = monthOf(max);
  const canBack = shown.year * 12 + shown.month > first.year * 12 + first.month;
  const canForward = shown.year * 12 + shown.month < last.year * 12 + last.month;

  const weeks = monthGrid(shown.year, shown.month, weekStart);
  const title = new Date(shown.year, shown.month, 1).toLocaleDateString(DATE_LOCALE, { month: 'long', year: 'numeric' });
  // The weekday initials, in the order the rows run. 2023-01-01 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, 1 + ((weekStart + i) % 7)).toLocaleDateString(DATE_LOCALE, { weekday: 'narrow' }),
  );

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
        {weekdays.map((d, i) => (
          <ThemedText key={i} type="smallCompact" themeColor="textSecondary" style={styles.weekday}>
            {d}
          </ThemedText>
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
                isToday={slot.iso === today}
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
  isToday,
  enabled,
  hijriOffset,
  onPress,
}: {
  slot: GridDay;
  selected: boolean;
  isToday: boolean;
  enabled: boolean;
  hijriOffset: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const hijri = hijriParts(slot.iso, hijriOffset);
  const moon = phaseOf(hijri?.day ?? 15, hijriMonthRange(slot.iso)?.length ?? 30);
  const date = new Date(`${slot.iso}T12:00:00`).toLocaleDateString(DATE_LOCALE, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const label = [isToday ? 'Today' : null, date, hijri ? `${hijri.day} ${hijri.monthName}` : null, moon.label]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !enabled }}
      style={({ pressed }) => [
        styles.cell,
        selected && { backgroundColor: theme.backgroundSelected },
        pressed && styles.pressed,
        !enabled && styles.disabled,
      ]}>
      {/* Today's number in the accent, the way every calendar marks it; the picked day carries the
          selection behind both number and moon, so the two never compete for the same mark. */}
      <ThemedText
        type={selected ? 'smallBold' : 'small'}
        style={[styles.number, { color: isToday ? theme.accent : theme.text }]}>
        {slot.day}
      </ThemedText>
      <MoonPhase illumination={moon.illumination} waxing={moon.waxing} size={DAY_MOON} rim />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.one },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two },
  title: { flex: 1, textAlign: 'center' },
  step: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingBottom: Spacing.one },
  cell: {
    flex: 1,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: Radius.button,
  },
  number: { fontVariant: ['tabular-nums'] },
  pressed: { opacity: Pressed.dim },
  disabled: { opacity: Disabled },
});
