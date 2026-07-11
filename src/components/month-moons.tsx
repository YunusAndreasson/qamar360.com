import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';
import { ProgressCell } from '@/components/progress-cell';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Duration, Scale } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { MonthDay, MonthProgress } from '@/hooks/use-progress';
import { haptics } from '@/lib/haptics';
import { moonIllumination } from '@/lib/moon';
import { toDegrees } from '@/lib/progress';

const MOON_SIZE = 42;
/** Per-cell entrance offset → a gentle wax across the grid as it appears. */
const STAGGER_MS = 14;

/** The White Days (Ayyām al-Bīḍ, 13th–15th): the moon is full and the Sunnah fast falls here. */
function isWhiteDay(day: number): boolean {
  return day >= 13 && day <= 15;
}

/** The focused day as a one-line reading, e.g. "Ramaḍān 14 · 156° · today". Upcoming days read as such. */
function dayReadout(d: MonthDay, monthName: string): string {
  const tags: string[] = [];
  if (d.state === 'today') tags.push('today');
  if (isWhiteDay(d.day)) tags.push('White Day');
  const value = d.state === 'future' ? 'upcoming' : `${toDegrees(d.fraction)}°`;
  return `${monthName} ${d.day} · ${value}${tags.length ? ` · ${tags.join(' · ')}` : ''}`;
}

/** The same reading spoken for a screen reader — degrees spelled out, tags comma-separated. */
function dayA11yLabel(d: MonthDay, monthName: string): string {
  const tags: string[] = [];
  if (d.state === 'today') tags.push('today');
  if (isWhiteDay(d.day)) tags.push('White Day');
  const value = d.state === 'future' ? 'upcoming' : `${toDegrees(d.fraction)} degrees complete`;
  return `${monthName} ${d.day}, ${value}${tags.length ? `, ${tags.join(', ')}` : ''}`;
}

/**
 * "This month": every day of the current Hijri month as a moon in a completion ring, laid out
 * six to a row like a contribution grid. Each moon shows that day's *true* lunar phase, so the
 * grid waxes to full around the 15th (laylat al-badr) and wanes back; the ring around it fills
 * with that day's completion. Today is emphasized, days still to come are faint. Tap any day to
 * read its exact figure in the header. Hidden without the Hijri calendar.
 */
export function MonthMoons({ month }: { month: MonthProgress | null }) {
  if (!month) return null;
  return <MonthMoonsBody month={month} />;
}

function MonthMoonsBody({ month }: { month: MonthProgress }) {
  // Which day the header reads — keyed by day-number so it survives a refresh's new day objects.
  // Defaults to today, so the readout shows a real figure on mount without an instructional prompt.
  const [focusedDayNum, setFocusedDayNum] = useState(month.dayOfMonth);
  const focused = month.days.find((d) => d.day === focusedDayNum) ?? null;

  return (
    <StatCard>
      <View style={styles.head}>
        <StatCardHeader title="This month" trailing={month.monthName} />
        {focused ? <MonthReadout day={focused} monthName={month.monthName} /> : null}
      </View>

      <View style={styles.grid}>
        {month.days.map((d, i) => (
          <MoonDay
            key={d.day}
            day={d}
            index={i}
            monthLength={month.monthLength}
            monthName={month.monthName}
            onFocus={setFocusedDayNum}
          />
        ))}
      </View>
    </StatCard>
  );
}

/** The live reading of the focused day: a quiet subtitle that refresh-fades when it changes. */
function MonthReadout({ day, monthName }: { day: MonthDay; monthName: string }) {
  const reduceMotion = useReducedMotion();
  // Born at rest (opacity 1); a barely-there dip→rise signals the value refreshed. Reduce Motion
  // swaps the text with no fade — substitute, don't soften, the way the rest of the screen gates.
  const fade = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      fade.set(1);
      return;
    }
    fade.set(0.4);
    fade.set(withTiming(1, { duration: Duration.base, easing: Easing.inOut(Easing.quad) }));
  }, [day.day, reduceMotion, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));

  return (
    <Animated.View style={fadeStyle}>
      <ThemedText type="smallCompact" themeColor="textSecondary" numberOfLines={1}>
        {dayReadout(day, monthName)}
      </ThemedText>
    </Animated.View>
  );
}

function MoonDay({
  day: d,
  index,
  monthLength,
  monthName,
  onFocus,
}: {
  day: MonthDay;
  index: number;
  monthLength: number;
  monthName: string;
  onFocus: (day: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const { illumination, waxing } = moonIllumination(d.day, monthLength);

  // Each cell fades and lifts in, offset by its position so the grid reads as a soft wax across
  // the month on appear. Reduce Motion shows it already settled.
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      enter.set(1);
      return;
    }
    enter.set(withDelay(index * STAGGER_MS, withTiming(1, { duration: Duration.slow, easing: Easing.out(Easing.cubic) })));
  }, [reduceMotion, enter, index]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.get(),
    transform: [{ scale: 0.9 + enter.get() * 0.1 }],
  }));

  // Tapping a day reads it in the header. A discrete-selection tick (not the commit/celebrate
  // textures, which are reserved) + the app's glyph-scale press — the haptic self-gates for a11y.
  return (
    <Animated.View style={[styles.cell, enterStyle]}>
      <PressableScale
        scaleTo={Scale.glyph}
        onPress={() => {
          haptics.selection();
          onFocus(d.day);
        }}
        accessibilityRole="button"
        accessibilityLabel={dayA11yLabel(d, monthName)}>
        <ProgressCell
          label={d.day}
          fraction={d.fraction}
          phase={{ illumination, waxing }}
          active={d.state === 'today'}
          muted={d.state === 'future'}
          whiteDay={isWhiteDay(d.day)}
          size={MOON_SIZE}
        />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three },
  cell: { width: '16.666%' },
});
