import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PressableScale } from '@/components/pressable-scale';
import { CELL_HEIGHT, ProgressCell } from '@/components/progress-cell';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { Duration, PageEnter, Scale } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { MonthDay, MonthProgress } from '@/hooks/use-progress';
import { haptics } from '@/lib/haptics';
import { moonIllumination } from '@/lib/moon';
import { toDegrees } from '@/lib/progress';

/** Moons per row — also the divisor for the scrub gesture's column math. */
const GRID_COLUMNS = 6;
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

  // Scrubbing: drag a finger across the moons and the readout follows day by day, a selection
  // tick ratcheting at each crossing — the tap interaction, made continuous. The pan needs 12pt
  // of HORIZONTAL travel to claim the touch and fails on 12pt of vertical, so page scrolling and
  // plain taps pass through untouched. Day math mirrors the grid's layout (GRID_COLUMNS across,
  // CELL_HEIGHT + rowGap down); a gap band reads as the row above it.
  const gridWidth = useSharedValue(0);
  const scrubDay = useSharedValue(0); // 0 = not scrubbing; else the last day the ratchet fired for
  const dayCount = month.days.length;
  const scrubTick = () => haptics.selection();
  const scrubTo = (x: number, y: number) => {
    'worklet';
    const w = gridWidth.get();
    if (w <= 0) return;
    const col = Math.min(GRID_COLUMNS - 1, Math.max(0, Math.floor(x / (w / GRID_COLUMNS))));
    const row = Math.floor(y / (CELL_HEIGHT + Spacing.three));
    if (row < 0) return; // above the grid — keep the current reading
    const index = row * GRID_COLUMNS + col;
    if (index >= dayCount) return; // past the partial last row / below the grid — keep it
    const day = index + 1;
    if (scrubDay.get() === day) return; // ratchet: fire only when the finger crosses a new day
    scrubDay.set(day);
    scheduleOnRN(setFocusedDayNum, day);
    scheduleOnRN(scrubTick);
  };
  const scrub = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onActivate: (e) => scrubTo(e.x, e.y),
    onUpdate: (e) => scrubTo(e.x, e.y),
    onFinalize: () => scrubDay.set(0), // next scrub re-ticks even if it lands on the same day
  });

  return (
    <StatCard>
      {/* No trailing month name: the hero card directly above already carries "<Month> <Year> H"
          large, and the readout line names the month again — a third naming was noise. */}
      <View style={styles.head}>
        <StatCardHeader title="This month" />
        {focused ? <StatReadout text={dayReadout(focused, month.monthName)} refreshKey={focused.day} /> : null}
      </View>

      <GestureDetector gesture={scrub}>
        <View style={styles.grid} onLayout={(e) => gridWidth.set(e.nativeEvent.layout.width)}>
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
      </GestureDetector>
    </StatCard>
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
  // the month on appear — starting on the page cascade's grid beat, so the wave begins as the
  // hero orbit establishes. Reduce Motion shows it already settled.
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      enter.set(1);
      return;
    }
    enter.set(
      withDelay(PageEnter.grid + index * STAGGER_MS, withTiming(1, { duration: Duration.slow, easing: Easing.out(Easing.cubic) })),
    );
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
        />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three },
  cell: { width: `${100 / GRID_COLUMNS}%` },
});
