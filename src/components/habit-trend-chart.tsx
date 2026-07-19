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
import { haptics } from '@/lib/haptics';
import { clamp01, toDegrees } from '@/lib/progress';

const H = 120;
const PAD_Y = 12;
const PAD_X = 12;
const DOT_R = 3;
const CURRENT_R = 4.5;

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Pt = { x: number; y: number };

function pointFor(index: number, fraction: number, width: number, count: number): Pt {
  const span = count > 1 ? index / (count - 1) : 0;
  const x = PAD_X + (width - 2 * PAD_X) * span;
  const y = PAD_Y + (1 - clamp01(fraction)) * (H - 2 * PAD_Y);
  return { x, y };
}

function polylineLength(points: Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** "This week" for the latest sample, else "N weeks ago" — the trend's time grammar. */
function weekLabel(index: number, count: number): string {
  const back = count - 1 - index;
  if (back === 0) return 'This week';
  return `${back} ${back === 1 ? 'week' : 'weeks'} ago`;
}

const pointReadout = (index: number, p: TrendPoint, count: number) =>
  p.scheduledCount === 0
    ? `${weekLabel(index, count)} · not scheduled`
    : `${weekLabel(index, count)} · ${toDegrees(p.rate)}°`;

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
        : withDelay(PageEnter.year, withTiming(1, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) })),
    );
  }, [width, reduceMotion, reveal]);

  const count = trend.length;
  const baselineY = H - PAD_Y;
  // Only weeks the habit actually ran in carry signal (`scheduledCount > 0`). Weeks without —
  // before the habit existed, or an off-season Hijri schedule — are absent from the line and
  // dots (their x-slots stay empty, keeping the time axis honest) instead of being drawn as 0°
  // misses pinned to the floor.
  const signalIdx = trend.map((p, i) => (p.scheduledCount > 0 ? i : -1)).filter((i) => i >= 0);
  const points =
    width > 0 ? signalIdx.map((i) => ({ index: i, ...pointFor(i, trend[i]!.rate, width, count) })) : [];
  const lineLength = polylineLength(points);

  const first = points[0];
  const last = points[points.length - 1];
  const hasLine = points.length >= 2 && !!first && !!last;
  const spine = points.map((p) => `${p.x} ${p.y}`).join(' L ');
  const linePath = hasLine ? `M ${spine}` : '';
  const areaPath = hasLine && first && last ? `M ${first.x} ${baselineY} L ${spine} L ${last.x} ${baselineY} Z` : '';

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
    .map((p, i) => `${weekLabel(i, count)} ${p.scheduledCount === 0 ? 'not scheduled' : `${toDegrees(p.rate)} degrees`}`)
    .join(', ')}.`;

  // Column boundaries: midpoints between adjacent point x-positions, edge columns run to the card
  // edge — 12 tap targets tiling the plot (the year chart's pattern).
  const step = width > 0 && count > 1 ? (width - 2 * PAD_X) / (count - 1) : 0;
  const columnBounds = (index: number): { left: number; width: number } => {
    const { x } = pointFor(index, 0, width, count);
    const left = index === 0 ? 0 : x - step / 2;
    const right = index === count - 1 ? width : x + step / 2;
    return { left, width: right - left };
  };

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
                Your rhythm draws here as you complete it.
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

              <Line x1={PAD_X} y1={baselineY} x2={width - PAD_X} y2={baselineY} stroke={theme.accentTrack} strokeWidth={1} />

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
              const { left, width: colWidth } = columnBounds(i);
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
