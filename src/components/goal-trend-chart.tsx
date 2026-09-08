import { useEffect, useId, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Duration, PageEnter } from '@/constants/motion';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildPaths, pointAt, polylineLength, spanColumns, type PlotBox } from '@/lib/chart';
import { dayTitle } from '@/lib/dates';
import { formatMeasure, goalPlot } from '@/lib/goals';
import { haptics } from '@/lib/haptics';

const BOX: PlotBox = { height: 120, padY: 12, padX: 12 };
const H = BOX.height;
const DOT_R = 3;
const CURRENT_R = 4.5;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * A goal's readings over time — the line the check-ins draw.
 *
 * Its sibling {@link import('./habit-trend-chart').HabitTrendChart} plots a rate, which is always
 * 0–1 and always climbs toward good. A measure does neither: it may run in kilograms or pages, and
 * for half the goals here **down is the direction of progress**. So the scale is derived from the
 * readings and the target together ({@link goalPlot}), and the target is drawn as a rule across
 * the plot — the line is read against that mark, not against a floor.
 *
 * Nothing is drawn between two readings. A check-in is a measurement, and a chart that interpolates
 * the days nobody answered is drawing something that was never observed; the points sit where the
 * dates put them and the line is the shortest honest path between them.
 *
 * It wears two hats, and `onPress` is what picks between them.
 *
 * On the goal's own screen it is an **instrument**: titled "Readings", scrubbable, and its readout
 * names the point under your finger. On Progress it is a **card in a list of cards** — titled with
 * the goal, carrying the standing as its resting reading, and opening the goal when tapped. There
 * the scrub is deliberately withheld: a card that both reads under a finger and navigates away
 * under the same finger is a card you cannot touch confidently, and on that screen the answer to
 * "how is it going" belongs on one line rather than at the end of a gesture.
 */
export function GoalTrendChart({
  series,
  target,
  unit,
  today,
  title = 'Readings',
  readout,
  onPress,
}: {
  series: { day: string; value: number }[];
  target: number;
  unit: string;
  today: string;
  /** The card's heading. The goal's own name where the card stands in a list of goals. */
  title?: string;
  /** The resting reading, when the card is not scrubbable — the goal's standing, in words. */
  readout?: string;
  /** Given, the whole card opens the goal and the scrub columns are withheld. */
  onPress?: () => void;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const areaFillId = `goalTrendArea-${useId()}`;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const reveal = useSharedValue(0);
  useEffect(() => {
    if (width <= 0) return;
    reveal.set(
      reduceMotion
        ? 1
        : withDelay(PageEnter.third, withTiming(1, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) })),
    );
  }, [width, reduceMotion, reveal]);

  const plot = goalPlot(series, target);
  const baselineY = H - BOX.padY;
  const points = plot && width > 0 ? plot.points.map((p) => pointAt(p.span, p.fraction, width, BOX)) : [];
  const lineLength = polylineLength(points);
  const { line: linePath, area: areaPath } = buildPaths(points, baselineY);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: lineLength * (1 - reveal.get()) }));
  const targetY = plot ? pointAt(0, plot.targetFraction, width, BOX).y : 0;

  const readAt = (index: number) => {
    const point = plot?.points[index];
    if (!point) return null;
    return `${dayTitle(point.day, today)} · ${formatMeasure(point.value)} ${unit}`;
  };
  const count = plot?.points.length ?? 0;
  const navigating = onPress !== undefined;
  const readoutText = navigating ? (readout ?? null) : readAt(focused ?? count - 1);

  const a11y = plot
    ? `Readings over time: ${plot.points.map((p) => `${dayTitle(p.day, today)} ${formatMeasure(p.value)} ${unit}`).join(', ')}. The target is ${formatMeasure(target)} ${unit}.`
    : undefined;

  const card = (
    <StatCard>
      <View style={styles.head}>
        <StatCardHeader
          title={title}
          trailing={navigating ? undefined : count > 0 ? `${count}` : undefined}
          // The chevron is right under the house rule: there IS more of this to read, and the
          // tap opens it. Only on the navigating card — the instrument opens nothing.
          accessory={navigating ? <AppIcon name="chevronRight" size={16} color={theme.textSecondary} /> : undefined}
        />
        {readoutText ? <StatReadout text={readoutText} refreshKey={navigating ? (readout ?? 'resting') : (focused ?? 'resting')} /> : null}
      </View>

      <View style={styles.plot}>
        {/* Inside a card that is itself a button, the plot must not be a second stop: a nested
            `accessible` view swallows the button it sits in. Its description moves onto the card. */}
        <View style={styles.chart} onLayout={onLayout} accessible={!navigating} accessibilityLabel={a11y}>
          {/* One reading is a fact, not a trend. Naming the space beats a flat line, which reads
              as a chart that failed rather than as a record one entry long. */}
          {!plot ? (
            <View style={styles.empty} pointerEvents="none">
              <ThemedText type="small" themeColor="textSecondary">
                Two readings draw a line.
              </ThemedText>
            </View>
          ) : null}
          {plot && width > 0 ? (
            <Svg width={width} height={H} viewBox={`0 0 ${width} ${H}`}>
              <Defs>
                <LinearGradient id={areaFillId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={theme.accent} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {/* The target, drawn where the measure has to reach. Dashed, because it is a mark to
                  arrive at rather than a floor the data sits on — the solid rule at the foot of
                  the rate charts means "zero", and this line means something else entirely. */}
              <Line
                x1={BOX.padX}
                y1={targetY}
                x2={width - BOX.padX}
                y2={targetY}
                stroke={theme.complete}
                strokeWidth={1}
                strokeDasharray="4 4"
              />

              {areaPath ? <Path d={areaPath} fill={`url(#${areaFillId})`} /> : null}

              {linePath ? (
                <AnimatedPath
                  d={linePath}
                  stroke={theme.accent}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={lineLength}
                  animatedProps={lineProps}
                />
              ) : null}

              {points.map((p, i) => (
                <Circle
                  key={plot.points[i]!.day}
                  cx={p.x}
                  cy={p.y}
                  r={i === count - 1 ? CURRENT_R : DOT_R}
                  fill={theme.accent}
                />
              ))}
            </Svg>
          ) : null}
        </View>

        {/* Tap targets follow the dots' real positions, not equal slices of the width: two
            readings three days apart sit close together, and equal columns would hand the tap to
            whichever one the arithmetic rounded to. */}
        {plot && width > 0 && !navigating
          ? spanColumns(
              plot.points.map((p) => p.span),
              width,
              BOX,
            ).map((column, i) => (
              <Pressable
                key={plot.points[i]!.day}
                style={[styles.column, { left: column.left, width: column.width }]}
                onPress={() => {
                  haptics.selection();
                  setFocused(i);
                }}
                accessibilityRole="button"
                accessibilityLabel={readAt(i) ?? ''}
              />
            ))
          : null}
      </View>
    </StatCard>
  );

  if (!onPress) return card;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, readout, a11y].filter(Boolean).join('. ')}
      accessibilityHint="Opens the goal"
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.two },
  plot: { gap: Spacing.three },
  chart: { width: '100%', height: H },
  column: { position: 'absolute', top: 0, bottom: 0 },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // The card carries the app's own elevation, so a press dims rather than scales — a scaling
  // shadowed surface reads as lifting off the page.
  pressed: { opacity: Pressed.dim },
});
