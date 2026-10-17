import { StyleSheet, View } from 'react-native';

import { MoonPhase } from '@/components/moon-phase';
import { OrbitMark } from '@/components/orbit-mark';
import { ThemedText } from '@/components/themed-text';
import { DenseLabelScale, FontWeight, Spacing } from '@/constants/theme';
import { DATE_LOCALE, JUMUAH, WEEKDAY_NAMES, hijriMonthRange, hijriParts } from '@/lib/dates';
import { phaseOf } from '@/lib/lunar-phase';
import { formatDegrees } from '@/lib/progress-format';

/** The day's orbit, round its date: big enough for a two-digit date inside the stroke. */
const DAY_ORBIT = 32;
const DAY_ORBIT_STROKE = 2.5;
/** The day's moon under its orbit: a glyph, with the rim, so a new moon still reads as one. */
const DAY_MOON = 12;
/** A {@link DayMark}'s height, for the rows that lay it out. */
export const DAY_MARK_HEIGHT = DAY_ORBIT + Spacing.one + DAY_MOON;

/** The day's moon, read off its Hijri date: the rule every moon in the app follows. */
function moonOf(iso: string, hijriOffset: number) {
  return phaseOf(hijriParts(iso, hijriOffset)?.day ?? 15, hijriMonthRange(iso)?.length ?? 30);
}

/**
 * One day as Today's week bar and the calendar both draw it: its date inside its orbit, its moon
 * beneath.
 *
 * The orbit is the day's own completion, drawn the way Progress draws the month ({@link OrbitMark}):
 * blue as far as it was kept, closed and warm when it was kept in full, absent when the day asked
 * for nothing. The moon is the calendar, the same phase the calendar has always shown under each
 * date. The two are kept apart (the date in the ring, the moon outside it) because a lit moon
 * inside a warm closed orbit is the same colour as it and, at this size, merges into one bright
 * disc.
 *
 * `ahead` is a day still to come: an empty orbit, the day it will be. `animate` belongs to the day
 * being worked on, whose orbit fills as its acts are ticked.
 */
export function DayMark({
  iso,
  rate,
  ahead = false,
  isToday,
  selected,
  animate = false,
  hijriOffset,
}: {
  iso: string;
  /** The day's completion (see `useDayRecord`): 0–1, `null` for nothing asked, `undefined` unknown. */
  rate: number | null | undefined;
  ahead?: boolean;
  isToday: boolean;
  selected: boolean;
  animate?: boolean;
  hijriOffset: number;
}) {
  const moon = moonOf(iso, hijriOffset);
  return (
    <View style={styles.mark}>
      <View style={styles.orbit}>
        <View style={StyleSheet.absoluteFill}>
          <OrbitMark
            rate={rate ?? null}
            size={DAY_ORBIT}
            strokeWidth={DAY_ORBIT_STROKE}
            groove={ahead || (rate !== null && rate !== undefined)}
            animate={animate}
          />
        </View>
        {/* Today's date in the accent, the way every calendar marks it. */}
        <ThemedText
          type={selected ? 'smallCompactBold' : 'smallCompact'}
          themeColor={isToday ? 'accent' : 'text'}
          maxFontSizeMultiplier={DenseLabelScale}>
          {Number(iso.slice(8))}
        </ThemedText>
      </View>
      <MoonPhase illumination={moon.illumination} waxing={moon.waxing} size={DAY_MOON} rim />
    </View>
  );
}

/**
 * A weekday's name over its column: short, in the week's order, Saturday to Jumuʿah.
 *
 * Jumuʿah stands in the primary ink where the other days are secondary: the week runs toward it and
 * closes on it, and it is the one day of the seven the app's week is built around. Weight and ink
 * only, no colour of its own: the accent already means today, and the warm gold means kept.
 */
export function WeekdayLabel({ weekday, isToday = false }: { weekday: number; isToday?: boolean }) {
  const jumuah = weekday === JUMUAH;
  return (
    <ThemedText
      type="smallCompact"
      themeColor={isToday ? 'accent' : jumuah ? 'text' : 'textSecondary'}
      maxFontSizeMultiplier={DenseLabelScale}
      style={(isToday || jumuah) && styles.strong}>
      {WEEKDAY_NAMES[weekday]?.slice(0, 3)}
    </ThemedText>
  );
}

/**
 * What a screen reader says for a day: which day, its Hijri date and moon, and how much of it was
 * kept, in the order a sighted reader takes them in.
 */
export function dayAccessibilityLabel(
  iso: string,
  { today, rate, hijriOffset }: { today: string; rate: number | null | undefined; hijriOffset: number },
): string {
  const date = new Date(`${iso}T12:00:00`).toLocaleDateString(DATE_LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
  const hijri = hijriParts(iso, hijriOffset);
  const kept =
    rate === undefined ? null : rate === null ? 'nothing due' : rate >= 1 ? 'kept in full' : `${formatDegrees(rate)} kept`;
  return [iso === today ? 'Today' : null, date, hijri ? `${hijri.day} ${hijri.monthName}` : null, moonOf(iso, hijriOffset).label, kept]
    .filter(Boolean)
    .join(', ');
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', gap: Spacing.one },
  orbit: { width: DAY_ORBIT, height: DAY_ORBIT, alignItems: 'center', justifyContent: 'center' },
  strong: { fontWeight: FontWeight.semibold },
});
