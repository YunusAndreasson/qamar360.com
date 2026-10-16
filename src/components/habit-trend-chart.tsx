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

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Duration, PageEnter } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { TrendPoint } from '@/hooks/use-habit-stats';
import { useTheme } from '@/hooks/use-theme';
import { buildPaths, columnBounds, pointAt, polylineLength, spanFor, type PlotBox } from '@/lib/chart';
import { haptics } from '@/lib/haptics';
import { formatDegrees } from '@/lib/progress-format';

const BOX: PlotBox = { height: 120, padY: 12, padX: 12 };
const H = BOX.height;
const DOT_R = 3;
const CURRENT_R = 4.5;

const AnimatedPath = Animated.createAnimatedComponent(Path);

const pointFor = (index: number, fraction: number, width: number, count: number) =>
  pointAt(spanFor(index, count), fraction, width, BOX);

/** "This week" for the latest sample, else "N weeks ago" — the trend's time grammar. */
function weekLabel(index: number, count: number): string {
  const back = count - 1 - index;
  if (back === 0) return 'This week';
  return `${back} ${back === 1 ? 'week' : 'weeks'} ago`;
}

const pointReadout = (index: number, p: TrendPoint, count: number) =>
  p.scheduledCount === 0
    ? `${weekLabel(index, count)} · not scheduled`
    : `${weekLabel(index, count)} · ${formatDegrees(p.rate)}`;

/**
 * "Over time" — this habit's completion rate as a rolling line across the last twelve weeks,
 * answering "am I improving?" for one practice. Each point is a trailing four-week rate (smoothed,
 * so a twice-weekly habit doesn't zig-zag), and the line draws on as the screen settles — the year
 * chart's motion at habit scale. Tap any week to read its figure; at rest the header reads the
 * latest week. Until there's something to show, it names the empty space rather than drawing a
 * flat line pinned to the floor (which reads as a broken chart).
 */
export function HabitTrendChart({ trend }: { trend: TrendPoint[] }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const areaFillId = `habitTrendArea-${useId()}`;

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

  const count = trend.length;
  const baselineY = H - BOX.padY;
  // Only weeks the habit actually ran in carry signal (`scheduledCount > 0`). Weeks without —
  // before the habit existed, or an off-season Hijri schedule — are absent from the line and
  // dots (their x-slots stay empty, keeping the time axis honest) instead of being drawn as 0°
  // misses pinned to the floor.
  const signalIdx = trend.map((p, i) => (p.scheduledCount > 0 ? i : -1)).filter((i) => i >= 0);
  const points =
    width > 0 ? signalIdx.map((i) => ({ index: i, ...pointFor(i, trend[i]!.rate, width, count) })) : [];
  const lineLength = polylineLength(points);
  const { line: linePath, area: areaPath } = buildPaths(points, baselineY);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: lineLength * (1 - reveal.get()) }));

  const hasData = trend.some((p) => p.rate > 0);
  // The resting readout (and the emphasized dot) belong to the latest week WITH signal — for a
  // young habit "this week" may still be pending, and reading it as data would be a lie.
  const latestSignal = signalIdx.length > 0 ? signalIdx[signalIdx.length - 1]! : null;
  const focusedPoint = focused != null ? (trend[focused] ?? null) : null;
  const readoutText = focusedPoint
    ? pointReadout(focused!, focusedPoint, count)
    : latestSignal != null
      ? pointReadout(latestSignal, trend[latestSignal]!, count)
      : null;

  const a11y = `Completion over the last ${count} weeks: ${trend
    .map((p, i) => `${weekLabel(i, count)} ${p.scheduledCount === 0 ? 'not scheduled' : formatDegrees(p.rate).replace('°', ' degrees')}`)
    .join(', ')}.`;

  return (
    <StatCard>
      <View style={styles.head}>
        <StatCardHeader title="Over time" trailing={`${count} weeks`} />
        {readoutText ? <StatReadout text={readoutText} refreshKey={focused ?? 'resting'} /> : null}
      </View>

      <View style={styles.plot}>
        <View style={styles.chart} onLayout={onLayout} accessible accessibilityLabel={a11y}>
          {!hasData ? (
            <View style={styles.empty} pointerEvents="none">
              <ThemedText type="small" themeColor="textSecondary">
                No completions to plot yet.
              </ThemedText>
            </View>
          ) : null}
          {width > 0 ? (
            <Svg width={width} height={H} viewBox={`0 0 ${width} ${H}`}>
              <Defs>
                <LinearGradient id={areaFillId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={theme.accent} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              <Line x1={BOX.padX} y1={baselineY} x2={width - BOX.padX} y2={baselineY} stroke={theme.accentTrack} strokeWidth={1} />

              {hasData && areaPath ? <Path d={areaPath} fill={`url(#${areaFillId})`} /> : null}

              {hasData && linePath ? (
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

              {hasData
                ? points.map((p) => {
                    const isCurrent = p.index === latestSignal;
                    const color = (trend[p.index]?.rate ?? 0) >= 1 ? theme.complete : theme.accent;
                    return <Circle key={p.index} cx={p.x} cy={p.y} r={isCurrent ? CURRENT_R : DOT_R} fill={color} />;
                  })
                : null}
            </Svg>
          ) : null}
        </View>

        {width > 0
          ? trend.map((_, i) => {
              const { left, width: colWidth } = columnBounds(i, count, width, BOX);
              return (
                <Pressable
                  key={i}
                  style={[styles.column, { left, width: colWidth }]}
                  onPress={() => {
                    haptics.selection();
                    setFocused(i);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={pointReadout(i, trend[i]!, count).replace('°', ' degrees')}
                />
              );
            })
          : null}
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.two },
  plot: { gap: Spacing.three },
  chart: { width: '100%', height: H },
  column: { position: 'absolute', top: 0, bottom: 0 },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
