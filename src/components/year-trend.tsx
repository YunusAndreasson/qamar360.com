import { useEffect, useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { DenseLabelScale } from '@/constants/theme';
import type { YearProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { clamp01, toDegrees } from '@/lib/progress';

const H = 92;
const PAD_Y = 12;
const DOT_R = 3;
const CURRENT_R = 4.5;
const FUTURE_R = 2.5;
// Half-width of an axis label box. A label is centered on its dot's x but clamped to the chart
// edges, so the horizontal inset must be ≥ this — otherwise the first/last dots sit nearer the
// edge than LABEL_HALF and their labels get shoved inward, drifting off the dot (the "1" and "12").
const LABEL_HALF = 12;
const PAD_X = LABEL_HALF;

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Pt = { x: number; y: number };

function pointFor(index: number, fraction: number, width: number): Pt {
  const x = PAD_X + (width - 2 * PAD_X) * (index / 11);
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

/**
 * "This year": the 12 Hijri months as a single trend line — the arc of the year so far. Past
 * months sit at their full completion, the current month is the leading point (month-to-date),
 * and months still to come wait as faint marks on the baseline. The line draws on as the screen
 * appears, echoing the hero orbit's sweep. Hidden without the Hijri calendar.
 */
export function YearTrend({ year }: { year: YearProgress | null }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  // A unique gradient id per instance — a hardcoded id would collide if two YearTrends ever
  // mount at once (e.g. mid nav-transition), making the second reference the first's fill.
  const areaFillId = `yearArea-${useId()}`;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Draw the line on once we have a width; lands instantly under Reduce Motion.
  const reveal = useSharedValue(0);
  useEffect(() => {
    if (width <= 0) return;
    reveal.value = reduceMotion ? 1 : withTiming(1, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) });
  }, [width, reduceMotion, reveal]);

  const baselineY = H - PAD_Y;
  const months = year?.months ?? [];
  const elapsed = months.filter((m) => m.state !== 'future');
  const linePoints = width > 0 ? elapsed.map((m) => pointFor(m.month - 1, m.fraction, width)) : [];
  const lineLength = polylineLength(linePoints);

  const first = linePoints[0];
  const last = linePoints[linePoints.length - 1];
  const hasLine = linePoints.length >= 2 && !!first && !!last;
  const spine = linePoints.map((p) => `${p.x} ${p.y}`).join(' L ');
  const linePath = hasLine ? `M ${spine}` : '';
  const areaPath = hasLine && first && last ? `M ${first.x} ${baselineY} L ${spine} L ${last.x} ${baselineY} Z` : '';

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: lineLength * (1 - reveal.value),
  }));

  if (!year) return null;

  const currentIndex = months.findIndex((m) => m.state === 'current');
  // All twelve months on the axis (1 → 12), with "now" emphasized.
  const labelIndices = months.map((_, i) => i);

  const a11y = `This Hijri year, ${year.year} H: ${elapsed
    .map((m) => `${m.monthName} ${toDegrees(m.fraction)} degrees`)
    .join(', ')}.`;

  return (
    <StatCard accessible accessibilityLabel={a11y}>
      <StatCardHeader title="This year" trailing={`${year.year} H`} />

      <View style={styles.chart} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={H} viewBox={`0 0 ${width} ${H}`}>
            <Defs>
              <LinearGradient id={areaFillId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.accent} stopOpacity={0.22} />
                <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* The faint floor the line rests on. */}
            <Line x1={PAD_X} y1={baselineY} x2={width - PAD_X} y2={baselineY} stroke={theme.accentTrack} strokeWidth={1} />

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

            {months.map((m) => {
              const i = m.month - 1;
              if (m.state === 'future') {
                const { x } = pointFor(i, 0, width);
                return <Circle key={m.month} cx={x} cy={baselineY} r={FUTURE_R} fill={theme.accentTrackMuted} />;
              }
              const p = pointFor(i, m.fraction, width);
              const isCurrent = m.state === 'current';
              const color = m.fraction >= 1 ? theme.complete : theme.accent;
              return <Circle key={m.month} cx={p.x} cy={p.y} r={isCurrent ? CURRENT_R : DOT_R} fill={color} />;
            })}
          </Svg>
        ) : null}
      </View>

      {/* A sparse month axis (numbers), with "now" emphasized in the accent. */}
      <View style={styles.axis}>
        {width > 0
          ? labelIndices.map((i) => {
              const { x } = pointFor(i, 0, width);
              const isCurrent = i === currentIndex;
              const isFuture = months[i]?.state === 'future';
              const left = Math.max(0, Math.min(width - LABEL_HALF * 2, x - LABEL_HALF));
              return (
                <View key={i} style={[styles.labelBox, { left }]}>
                  <ThemedText
                    type={isCurrent ? 'smallCompactBold' : 'smallCompact'}
                    maxFontSizeMultiplier={DenseLabelScale}
                    // Same axis language as the month grid (ProgressCell): you-are-here = accent,
                    // months still to come are dimmed, past months sit at textSecondary.
                    style={{ color: isCurrent ? theme.accent : isFuture ? theme.textDisabled : theme.textSecondary }}>
                    {i + 1}
                  </ThemedText>
                </View>
              );
            })
          : null}
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  chart: { width: '100%', height: H },
  axis: { height: 16 },
  labelBox: { position: 'absolute', width: LABEL_HALF * 2, alignItems: 'center' },
});
