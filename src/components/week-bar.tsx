import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { DAY_MARK_HEIGHT, DayMark, WeekdayLabel, dayAccessibilityLabel } from '@/components/day-mark';
import { Spring } from '@/constants/motion';
import { Disabled, Elevation, Pressed, Radius, Spacing } from '@/constants/theme';
import { useDayRecord } from '@/hooks/use-day-record';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { addDaysISO, weekDaysFrom, weekStartISO, weekdayIndex } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { usePreference } from '@/lib/preferences';

/** Above and below a day's label and mark, inside its tile. */
const DAY_PAD = Spacing.one + Spacing.half;
/** The weekday label's line (`smallCompact`). */
const LABEL_HEIGHT = 16;
/** The bar's height: one day, top to bottom. Fixed, so nothing below moves while it measures. */
const BAR_HEIGHT = DAY_PAD * 2 + LABEL_HEIGHT + Spacing.one + DAY_MARK_HEIGHT;
/** How far the selection tile stands in from its column's edges, so neighbouring tiles never touch. */
const TILE_INSET = Spacing.half;

/**
 * The week on Today: seven days, Saturday to Jumuʿah, each with how much of it was kept.
 *
 * Each day is the calendar's own cell ({@link DayMark}): its date inside its orbit, its moon
 * beneath. So the bar is one row of the calendar the header opens, lifted onto the page, and the
 * orbits are Progress's month drawn at the size of a day: blue as far as a day went, warm when it
 * closed. The day you are on stands on a tile of the cards' own material, the day the cards below
 * belong to, and slides across when you pick another.
 *
 * Tap a day to go to it; swipe for the weeks before, as far back as the day picker reaches. Days
 * ahead are drawn (an empty orbit and the moon they will have) but can't be picked, as in the
 * calendar. When the day moves from elsewhere (the calendar, midnight turning the week), the bar
 * follows it to its week.
 *
 * The orbits read from `useDayRecord`, which writes the viewed day's ticks straight into the
 * record, so the orbit above the day you are ticking fills with its stack rings.
 */
export function WeekBar({ style }: { style?: StyleProp<ViewStyle> }) {
  const { viewDate, today, minViewDate, setViewDate } = useHabits();
  const { rateOn } = useDayRecord();
  const hijriOffset = usePreference('hijriOffset');
  const [width, setWidth] = useState(0);
  const pager = useRef<ScrollViewInstance>(null);
  // Placed once without motion (the first layout); every later move to another week is animated.
  const placed = useRef(false);

  const weeks: string[] = [];
  for (let start = weekStartISO(minViewDate); start <= today; start = addDaysISO(start, 7)) weeks.push(start);
  const page = Math.max(0, weeks.indexOf(weekStartISO(viewDate)));
  // The page in view, for the screen reader: only its seven days are announced, so swiping through
  // the bar is a week and not every week the bar can hold. A swipe is remembered against the page
  // it left, so the moment the day moves to another week the bar is back on the day's own.
  const [swiped, setSwiped] = useState<{ from: number; to: number } | null>(null);
  const shown = swiped && swiped.from === page ? swiped.to : page;

  useEffect(() => {
    if (width === 0 || !placed.current) return;
    pager.current?.scrollTo({ x: page * width, animated: true });
  }, [page, width]);

  const pick = (iso: string) => {
    if (iso === viewDate) return;
    haptics.selection();
    setViewDate(iso);
  };

  return (
    <View style={[styles.root, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: page * width, y: 0 }}
          onContentSizeChange={() => {
            if (placed.current) return;
            pager.current?.scrollTo({ x: page * width, animated: false });
            placed.current = true;
          }}
          onMomentumScrollEnd={(e) => setSwiped({ from: page, to: Math.round(e.nativeEvent.contentOffset.x / width) })}>
          {weeks.map((start, index) =>
            // Only the week in view and the two a swipe can reach are drawn; the rest hold their
            // width. Every tick re-renders the bar, and six weeks of orbits and moons is a cost the
            // one week you can see doesn't need.
            Math.abs(index - shown) <= 1 || index === page ? (
              <WeekPage
                key={start}
                days={weekDaysFrom(start)}
                width={width}
                hidden={index !== shown}
                viewDate={viewDate}
                today={today}
                minViewDate={minViewDate}
                rateOn={rateOn}
                hijriOffset={hijriOffset}
                onPick={pick}
              />
            ) : (
              <View key={start} style={{ width }} />
            ),
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

function WeekPage({
  days,
  width,
  hidden,
  viewDate,
  today,
  minViewDate,
  rateOn,
  hijriOffset,
  onPick,
}: {
  days: string[];
  width: number;
  hidden: boolean;
  viewDate: string;
  today: string;
  minViewDate: string;
  rateOn: (iso: string) => number | null | undefined;
  hijriOffset: number;
  onPick: (iso: string) => void;
}) {
  const column = width / days.length;
  const selected = days.indexOf(viewDate);
  return (
    <View
      style={[styles.page, { width }]}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
      {selected >= 0 ? <SelectionTile index={selected} column={column} /> : null}
      {days.map((iso) => {
        const ahead = iso > today;
        const enabled = !ahead && iso >= minViewDate;
        const rate = rateOn(iso);
        return (
          <Pressable
            key={iso}
            onPress={() => onPick(iso)}
            disabled={!enabled}
            accessibilityRole="button"
            accessibilityLabel={dayAccessibilityLabel(iso, { today, rate, hijriOffset })}
            accessibilityState={{ selected: iso === viewDate, disabled: !enabled }}
            style={({ pressed }) => [styles.day, pressed && styles.pressed, !enabled && styles.disabled]}>
            <WeekdayLabel weekday={weekdayIndex(iso)} isToday={iso === today} />
            <DayMark
              iso={iso}
              rate={rate}
              ahead={ahead}
              isToday={iso === today}
              selected={iso === viewDate}
              animate={iso === viewDate}
              hijriOffset={hijriOffset}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The day you are on: a tile of card material under its column, the stuff the cards below are made
 * of, so the bar says which day those cards are. It slides to a newly picked day on the same spring
 * as the segmented control's thumb, and lands without motion under Reduce Motion.
 */
function SelectionTile({ index, column }: { index: number; column: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const target = index * column + TILE_INSET;
  const x = useSharedValue(target);
  useEffect(() => {
    x.set(reduceMotion ? target : withSpring(target, Spring.settle));
  }, [target, reduceMotion, x]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tile,
        {
          width: column - TILE_INSET * 2,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderTopColor: theme.topHighlight,
        },
        slide,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { height: BAR_HEIGHT },
  page: { flexDirection: 'row' },
  day: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: DAY_PAD,
  },
  tile: {
    ...Elevation.thumb,
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.button,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: Pressed.dim },
  disabled: { opacity: Disabled },
});
