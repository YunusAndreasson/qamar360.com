import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Duration, Ease, PageEnter } from '@/constants/motion';
import { DenseLabelScale, Radius, Spacing } from '@/constants/theme';
import type { WeekdayStat } from '@/hooks/use-habit-stats';
import { useTheme } from '@/hooks/use-theme';
import { WEEKDAY_LABELS, WEEKDAY_NAMES, WEEK_ORDER } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { clamp01 } from '@/lib/progress';
import { formatDegrees } from '@/lib/progress-format';

const MAX_BAR_HEIGHT = 96;
const BAR_WIDTH = 14;
const STAGGER_MS = 40;

/** The readout names a weekday in the plural ("Strongest on Fridays") — it reads as a habit
 *  rather than a single date, where the single-letter axis labels stay compact under each bar. */
const plural = (weekday: number) => `${WEEKDAY_NAMES[weekday] ?? ''}s`;

function weekdayReadout(stat: WeekdayStat, best: number | null, tough: number | null): string {
  const tag = stat.weekday === best ? ' · strongest' : stat.weekday === tough ? ' · toughest' : '';
  return `${plural(stat.weekday)} · ${formatDegrees(stat.rate)}${tag}`;
}

function weekdayA11y(stat: WeekdayStat, best: number | null, tough: number | null): string {
  const tag = stat.weekday === best ? ', your strongest' : stat.weekday === tough ? ', your toughest' : '';
  return `${plural(stat.weekday)}, ${formatDegrees(stat.rate).replace('°', ' degrees')}${tag}`;
}

/**
 * One weekday's bar — a track the fill grows up within on appear (staggered left-to-right, the
 * month grid's wave at bar scale). No persistent focus mark: the readout swap + selection haptic
 * are the acknowledgment (the same restraint as the year chart).
 *
 * **Every bar is the same tone.** The best day used to be drawn in warm `complete` moonlight, which
 * is the one colour this app reserves for a thing KEPT IN FULL — the lit moon, the closed orbit, a
 * month's figure at 360°. "Your strongest weekday" is a superlative, not a completion: a gold
 * Sunday standing at 40° told a reader who had learned the app's one colour rule that Sundays were
 * finished. The rank was never the colour's job anyway — the tallest bar is the best one, which is
 * what a bar chart is FOR, and the readout above names it in words.
 */
function Bar({
  stat,
  index,
  onPress,
  a11yLabel,
}: {
  stat: WeekdayStat;
  index: number;
  onPress: () => void;
  a11yLabel: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const targetHeight = MAX_BAR_HEIGHT * clamp01(stat.rate); // computed off-worklet (no fn call inside)

  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.set(
      reduceMotion
        ? 1
        : withDelay(PageEnter.second + index * STAGGER_MS, withTiming(1, { duration: Duration.slow, easing: Ease.draw })),
    );
  }, [reduceMotion, reveal, index]);
  const fillStyle = useAnimatedStyle(() => ({ height: targetHeight * reveal.get() }));

  return (
    <Pressable style={styles.barCol} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11yLabel}>
      <View style={[styles.track, { backgroundColor: theme.accentTrack }]}>
        <Animated.View style={[styles.fill, { backgroundColor: theme.accent }, fillStyle]} />
      </View>
      <ThemedText type="smallCompact" themeColor="textSecondary" maxFontSizeMultiplier={DenseLabelScale}>
        {WEEKDAY_LABELS[stat.weekday]}
      </ThemedText>
    </Pressable>
  );
}

/**
 * "Best day" — the completion rate for each weekday this habit runs on, so you can see where the
 * routine holds and where it slips (context/cue friction is the actionable lever in habit
 * research). Only the scheduled weekdays are drawn, so a Monday/Thursday habit shows two bars, not
 * seven. Tap a bar to read its figure. When the habit is Hijri-scheduled a weekday split is
 * meaningless, so the card names the schedule instead (`hijriNote`).
 */
export function HabitWeekdayBars({
  byWeekday,
  bestWeekday,
  toughestWeekday,
  hijriNote,
}: {
  byWeekday: WeekdayStat[];
  bestWeekday: number | null;
  toughestWeekday: number | null;
  hijriNote?: string;
}) {
  const [focused, setFocused] = useState<number | null>(null);
  if (hijriNote) {
    return (
      <StatCard>
        <StatCardHeader title="Schedule" />
        <ThemedText type="rowTitle">{hijriNote}</ThemedText>
        <ThemedText type="smallCompact" themeColor="textSecondary">
          A weekday pattern doesn’t apply to a Hijri-scheduled practice.
        </ThemedText>
      </StatCard>
    );
  }

  // Bars run left-to-right Saturday to Jumuʿah, so the chart reads like the week everywhere else.
  const rank = new Map<number, number>(WEEK_ORDER.map((weekday, i) => [weekday, i]));
  const active = byWeekday
    .filter((w) => w.scheduledCount > 0)
    .sort((a, b) => (rank.get(a.weekday) ?? 0) - (rank.get(b.weekday) ?? 0));
  const restingText = bestWeekday != null ? `Strongest on ${plural(bestWeekday)}` : 'Complete it to see your rhythm';
  const focusedStat = focused != null ? (byWeekday[focused] ?? null) : null;
  const readoutText = focusedStat ? weekdayReadout(focusedStat, bestWeekday, toughestWeekday) : restingText;

  const a11y = `Best day. ${active.map((w) => `${plural(w.weekday)} ${formatDegrees(w.rate).replace('°', ' degrees')}`).join(', ')}.`;

  return (
    <StatCard>
      <View style={styles.head}>
        <StatCardHeader title="Best day" />
        <StatReadout text={readoutText} refreshKey={focused ?? 'resting'} />
      </View>

      <View style={styles.bars} accessible accessibilityLabel={a11y}>
        {active.map((w, i) => (
          <Bar
            key={w.weekday}
            stat={w}
            index={i}
            a11yLabel={weekdayA11y(w, bestWeekday, toughestWeekday)}
            onPress={() => {
              haptics.selection();
              setFocused(w.weekday);
            }}
          />
        ))}
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.two },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barCol: { flex: 1, alignItems: 'center', gap: Spacing.two },
  // A pill track the fill rises within; overflow-hidden clips the fill's square bottom to the
  // track's rounding.
  track: {
    width: BAR_WIDTH,
    height: MAX_BAR_HEIGHT,
    borderRadius: Radius.full,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: { width: '100%', borderRadius: Radius.full },
});
