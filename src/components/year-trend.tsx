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
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Duration, PageEnter } from '@/constants/motion';
import { DenseLabelScale, Spacing } from '@/constants/theme';
import type { TrendSummary, YearMonth, YearProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { clamp01, toDegrees } from '@/lib/progress';

const H = 120;
const PAD_Y = 12;
const DOT_R = 3;
const CURRENT_R = 4.5;
const FUTURE_R = 2.5;
// Half-width of an axis label box. A label is centered on its dot's x but clamped to the chart
// edges, so the horizontal inset must be ≥ this — otherwise the first/last dots sit nearer the
// edge than LABEL_HALF and their labels get shoved inward, drifting off the dot (the "1" and "12").
const LABEL_HALF = 12;
const PAD_X = LABEL_HALF;
// Numerals 1–12, one under every dot: an evenly-ruled axis. A sparse named axis (Muḥ … DhḤ at
// anchors) was tried and read worse — uneven label spacing obscured the month grid.
const LABEL_W = LABEL_HALF * 2;

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

/** A month as a one-line reading, in the month grid's grammar: "Ṣafar · 204°", the current month
 *  tagged "this month" (the year-scale sibling of the grid's "today"), months to come "upcoming". */
function monthReadout(m: YearMonth): string {
  if (m.state === 'future') return `${m.monthName} · upcoming`;
  const value = `${toDegrees(m.fraction)}°`;
  return m.state === 'current' ? `${m.monthName} · ${value} · this month` : `${m.monthName} · ${value}`;
}

/** The same reading spoken for a screen reader — degrees spelled out, tags comma-separated. */
function monthA11yLabel(m: YearMonth): string {
  if (m.state === 'future') return `${m.monthName}, upcoming`;
  const value = `${toDegrees(m.fraction)} degrees complete`;
  return m.state === 'current' ? `${m.monthName}, ${value}, this month` : `${m.monthName}, ${value}`;
}

/**
 * "This year": the 12 Hijri months as a single trend line — the arc of the year so far. Past
 * months sit at their full completion, the current month is the leading point (month-to-date),
 * and months still to come wait as faint marks on the baseline. The line draws on as the screen
 * appears, echoing the hero orbit's sweep. Tap any month to read its figure in the header; at
 * rest the readout carries the screen's one multi-month sentence — "Rising since …" — when the
 * closed months have genuinely risen, else the current month's reading. Hidden without the
 * Hijri calendar.
 */
export function YearTrend({ year, trend }: { year: YearProgress | null; trend: TrendSummary | null }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  // Which month the header reads — null is the resting state (trend / current month). Keyed by
  // month-number so it survives a refresh's new month objects.
  const [focusedMonthNum, setFocusedMonthNum] = useState<number | null>(null);
  // A unique gradient id per instance — a hardcoded id would collide if two YearTrends ever
  // mount at once (e.g. mid nav-transition), making the second reference the first's fill.
  const areaFillId = `yearArea-${useId()}`;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Draw the line on once we have a width — last in the page cascade, into the settled page.
  // The effect fires once on layout, so the delay shapes only the entrance, never a refetch.
  // Lands instantly under Reduce Motion.
  const reveal = useSharedValue(0);
  useEffect(() => {
    if (width <= 0) return;
    reveal.set(
      reduceMotion
        ? 1
        : withDelay(PageEnter.year, withTiming(1, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) })),
    );
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
    strokeDashoffset: lineLength * (1 - reveal.get()),
  }));

  if (!year) return null;

  const currentIndex = months.findIndex((m) => m.state === 'current');

  // The reading under the header: a tapped month wins; at rest, the trend statement — the
  // screen's answer to "am I improving?" — when the run is real, else today's month. The
  // statement is a direction, not a number: the chart below it is the evidence.
  const focused = focusedMonthNum != null ? (months.find((m) => m.month === focusedMonthNum) ?? null) : null;
  const current = months[currentIndex] ?? null;
  const restingText =
    trend && trend.risingMonths >= 3 && trend.sinceMonthName
      ? `Rising since ${trend.sinceMonthName}`
      : current
        ? monthReadout(current)
        : null;
  const readoutText = focused ? monthReadout(focused) : restingText;

  const trendA11y =
    trend && trend.risingMonths >= 3 && trend.sinceMonthName
      ? ` Whole-month completion has risen for ${trend.risingMonths} months, since ${trend.sinceMonthName}.`
      : '';
  const a11y = `This Hijri year, ${year.year} H: ${elapsed
    .map((m) => `${m.monthName} ${toDegrees(m.fraction)} degrees`)
    .join(', ')}.${trendA11y}`;

  // Each month's touch column: boundaries at the midpoints between adjacent dot x-positions
  // (the dots are inset by PAD_X, so columns are NOT width/12 — edge columns run to the card's
  // edge). Full plot height (chart + axis), so 12 targets tile like a segmented control.
  const step = width > 0 ? (width - 2 * PAD_X) / 11 : 0;
  const columnBounds = (index: number): { left: number; width: number } => {
    const { x } = pointFor(index, 0, width);
    const left = index === 0 ? 0 : x - step / 2;
    const right = index === 11 ? width : x + step / 2;
    return { left, width: right - left };
  };

  return (
    <StatCard>
      <View style={styles.head}>
        <StatCardHeader title="This year" trailing={`${year.year} H`} />
        {readoutText ? <StatReadout text={readoutText} refreshKey={focusedMonthNum ?? 'resting'} /> : null}
      </View>

      {/* Chart + axis share one relatively-positioned plot so the invisible month columns can
          overlay both — the tap target is the full plot height, not a 3px dot. */}
      <View style={styles.plot}>
        <View style={styles.chart} onLayout={onLayout} accessible accessibilityLabel={a11y}>
          {/* A brand-new year has no line yet — say what the empty space is for, instead of
              presenting a bare baseline that reads as a broken chart. */}
          {elapsed.length <= 1 ? (
            <View style={styles.firstYear} pointerEvents="none">
              <ThemedText type="small" themeColor="textSecondary">
                The year’s arc draws here, month by month.
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

        {/* Month numerals, one per dot ("now" in the accent — the sole label lifted above
            textSecondary; the future/past distinction lives on the dots). Hidden from screen
            readers: the month columns above them speak each month by name. */}
        <View
          style={styles.axis}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {width > 0
            ? months.map((m) => {
                const i = m.month - 1;
                const { x } = pointFor(i, 0, width);
                const isCurrent = i === currentIndex;
                const left = Math.max(0, Math.min(width - LABEL_W, x - LABEL_W / 2));
                return (
                  <View key={m.month} style={[styles.labelBox, { left }]}>
                    <ThemedText
                      type={isCurrent ? 'smallCompactBold' : 'smallCompact'}
                      maxFontSizeMultiplier={DenseLabelScale}
                      style={{ color: isCurrent ? theme.accent : theme.textSecondary }}>
                      {m.month}
                    </ThemedText>
                  </View>
                );
              })
            : null}
        </View>

        {/* The invisible month columns. Plain Pressables — nothing visible to scale, and no
            persistent focus mark on the dot (the month grid deliberately has none): the readout
            swap + the selection tick are the acknowledgment. */}
        {width > 0
          ? months.map((m) => {
              const { left, width: colWidth } = columnBounds(m.month - 1);
              return (
                <Pressable
                  key={m.month}
                  style={[styles.column, { left, width: colWidth }]}
                  onPress={() => {
                    haptics.selection();
                    setFocusedMonthNum(m.month);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={monthA11yLabel(m)}
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
  // The card's own gap separates head ↔ plot; inside the plot, chart ↔ axis keep the same rhythm.
  plot: { gap: Spacing.three },
  chart: { width: '100%', height: H },
  axis: { height: 16 },
  labelBox: { position: 'absolute', width: LABEL_W, alignItems: 'center' },
  column: { position: 'absolute', top: 0, bottom: 0 },
  // Centred in the chart's empty airspace, above the baseline.
  firstYear: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
