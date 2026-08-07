import { useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Duration, PageEnter } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { RecordSeries, SeriesPoint, TrendSummary } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { buildSmoothPaths, pointAt, polylineLength, project, spanFor, trailingMean, type PlotBox, type Pt } from '@/lib/chart';
import { hijriParts } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { toDegrees } from '@/lib/progress';

// Taller than the 120 the small Insights charts use, and with real headroom at the top: this is the
// screen's second instrument, and a run of full orbits was jamming flat against the ceiling where a
// curve needs somewhere to sit.
const BOX: PlotBox = { height: 148, padY: 18, padX: 14 };
const BASELINE_Y = BOX.height - BOX.padY;

const CURRENT_R = 4.5;

/** The trailing window at day grain — one turn of the weekly schedule most habits run on, so a
 *  Monday-only act stops reading as six misses and a spike. Wider buckets are already averages of
 *  their own span and are not smoothed twice. */
const DAILY_TREND_WINDOW = 7;
/** How far back the projection is fitted — recent shape only, so an old rhythm can't anchor it. */
const FIT_WINDOW = 14;
/** The furthest ahead the line ever looks, in buckets. */
const MAX_HORIZON = 6;

/** A bucket as a reading. One day says its date; a wider span says the day it ends on, which is the
 *  most recent thing in it and so the one you were looking for. */
function bucketLabel({ iso, endISO, pending }: SeriesPoint): string {
  if (pending) return 'Today';
  const parts = hijriParts(endISO);
  if (!parts) return endISO;
  const end = `${parts.day} ${parts.monthName}`;
  if (iso === endISO) return end;
  const from = hijriParts(iso);
  // Within one Hijri month say "8–14 Ṣafar"; across a boundary name both, or the pair reads as one.
  if (from && from.month === parts.month) return `${from.day}–${end}`;
  return from ? `${from.day} ${from.monthName} – ${end}` : end;
}

/**
 * "Over time" — the whole record as one line.
 *
 * The screen's second instrument, and the only one that moves on a second day of use: the hero
 * measures the month you are in, this measures whether you are becoming someone who keeps it.
 *
 * **There is no scale to choose.** The line always spans the entire record, and the width of a
 * point grows with its length — a day each at first, a fortnight each after a couple of years — so
 * the resolution follows the history rather than a control. A Days / Months / Years switch made you
 * do that by hand, made you notice you were doing it, and left two of its three settings empty for
 * anyone new. What replaced it is not a hidden mode: it is the absence of modes.
 *
 * The line's grammar is one rule: **solid is settled, dashed is not.** A solid curve runs through
 * what is closed; a dashed one carries on through the span still being lived and out to where the
 * fitted slope is heading, ending in a caret. The future is drawn in the same ink as the present
 * and marked as provisional — direction without a promise.
 *
 * Nothing names a date until you ask. At rest the card says which way you are going and where you
 * are; the calendar appears under your finger and leaves with it, because a date printed on the
 * axis is a label you read once and then have to keep ignoring.
 */
export function OverTime({ series, trend }: { series: RecordSeries; trend: TrendSummary | null }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const areaFillId = `overTimeArea-${useId()}`;

  const points = series.points;
  const count = points.length;

  // Closed buckets carry the settled curve; the one still running and the projection carry the dash.
  const closed = useMemo(() => points.map((p, i) => ({ p, i })).filter((x) => x.p.possible > 0 && !x.p.pending), [points]);
  const means = useMemo(
    // A bucket wider than a day is already an average of its own span; smoothing it again would be
    // averaging twice and would flatten the very changes the line exists to show.
    () => trailingMean(closed.map((x) => x.p.rate), series.bucketDays > 1 ? 1 : DAILY_TREND_WINDOW),
    [closed, series.bucketDays],
  );

  // Room ahead grows with what is behind: a quarter of the record, capped. A fixed horizon would
  // swallow half the plot on a two-day chart and read as mostly speculation.
  const horizon = count > 0 ? Math.min(MAX_HORIZON, Math.max(1, Math.round(count / 4))) : 0;
  const projection = useMemo(
    // Fitted on closed buckets only. A day still being lived reads near zero in the morning, and a
    // forecast that dives at breakfast and recovers by night is noise wearing the clothes of a trend.
    () => (horizon > 0 ? project(means, { horizon, fitWindow: FIT_WINDOW }) : null),
    [horizon, means],
  );

  // The room ahead is only real if something is drawn in it — otherwise a lone first day would sit
  // pinned to the left edge with empty space beside it.
  const total = count + (projection ? horizon : 0);

  const [width, setWidth] = useState(0);
  const widthSV = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.set(w);
  };

  const at = (index: number, rate: number): Pt => pointAt(spanFor(index, total), rate, width, BOX);

  const settled: Pt[] = width > 0 ? closed.map((x, k) => at(x.i, means[k]!)) : [];
  const nowIndex = points.findIndex((p) => p.pending);
  const nowPoint = width > 0 && nowIndex >= 0 && points[nowIndex]!.possible > 0 ? at(nowIndex, points[nowIndex]!.rate) : null;
  // The dashed run: on from the settled curve, through the span still open, out to where the slope
  // points. It starts at the last settled point so the two read as one stroke.
  const unsettled: Pt[] =
    width > 0
      ? [
          ...(settled.length > 0 ? [settled[settled.length - 1]!] : []),
          ...(nowPoint ? [nowPoint] : []),
          ...(projection?.values ?? []).map((v, k) => at(count + k, v)),
        ]
      : [];

  const settledPaths = buildSmoothPaths(settled, BASELINE_Y);
  const unsettledPath = buildSmoothPaths(unsettled, BASELINE_Y).line;
  // The curve is longer than the polyline through the same points, so a dash budget measured on the
  // chords would finish the reveal early and snap the tail in. A little over is invisible; under is
  // not — the sweep simply lands a touch before its duration ends.
  const settledLength = polylineLength(settled) * 1.15;

  // The curve draws on as the page settles — the hero's orbit sweep at chart scale. Fires on layout,
  // so the delay shapes the entrance only, never a refetch. Instant under Reduce Motion.
  const reveal = useSharedValue(0);
  useEffect(() => {
    if (width <= 0) return;
    reveal.set(
      reduceMotion
        ? 1
        : withDelay(PageEnter.second, withTiming(1, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) })),
    );
  }, [width, reduceMotion, reveal]);
  const settledProps = useAnimatedProps(() => ({ strokeDashoffset: settledLength * (1 - reveal.get()) }));
  // The dashed run can't draw on — a dash offset is already spoken for by its pattern — so it
  // surfaces instead, arriving as the solid stroke lands.
  const unsettledProps = useAnimatedProps(() => ({ opacity: 0.55 * reveal.get() }));

  // ── Scrub ────────────────────────────────────────────────────────────────────────────────────
  const [focused, setFocused] = useState<number | null>(null);
  const cursorX = useSharedValue(0);
  const cursorOn = useSharedValue(0);
  const lastIndex = useSharedValue(-1);

  const tick = () => haptics.selection();
  const moveTo = (x: number) => {
    'worklet';
    const w = widthSV.get();
    if (w <= 0 || count === 0) return;
    const inner = Math.max(1, w - 2 * BOX.padX);
    const raw = Math.round(((x - BOX.padX) / inner) * (total > 1 ? total - 1 : 1));
    // Never past the last real bucket: the projection is where you are heading, not somewhere you
    // can stand and take a reading.
    const i = raw < 0 ? 0 : raw > count - 1 ? count - 1 : raw;
    cursorX.set(BOX.padX + inner * (total > 1 ? i / (total - 1) : 0.5));
    cursorOn.set(1);
    if (lastIndex.get() === i) return; // ratchet: one beat per bucket crossed, never per frame
    lastIndex.set(i);
    scheduleOnRN(setFocused, i);
    scheduleOnRN(tick);
  };
  const release = () => {
    'worklet';
    cursorOn.set(withTiming(0, { duration: Duration.base }));
    lastIndex.set(-1); // so the next scrub re-ticks even on the same bucket
    // The reading goes back to the resting one: a date is what you asked for, not a place the card
    // is left parked.
    scheduleOnRN(setFocused, null);
  };

  const scrub = usePanGesture({
    // 12pt of horizontal travel to claim the touch, and a fail on 12pt of vertical — so the page
    // still scrolls through the chart. Without this pair the card becomes a scroll trap.
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onActivate: (e) => moveTo(e.x),
    onUpdate: (e) => moveTo(e.x),
    onFinalize: () => release(),
  });
  // A tap reads one bucket. `maxDistance` is load-bearing: without it a vertical scroll drag still
  // ends in a recognised tap, and flicking the page would take a reading on the way past.
  const read = useTapGesture({ maxDistance: 8, onActivate: (e) => moveTo(e.x), onFinalize: () => release() });
  const gesture = useCompetingGestures(scrub, read);

  const cursorProps = useAnimatedProps(() => ({ x1: cursorX.get(), x2: cursorX.get(), opacity: cursorOn.get() }));
  const focusProps = useAnimatedProps(() => ({ opacity: cursorOn.get() }));

  // ── The reading ──────────────────────────────────────────────────────────────────────────────
  const latestMean = means[means.length - 1];
  const focusedPoint = focused != null ? (points[focused] ?? null) : null;
  const restingText =
    // The screen's one multi-month sentence, when the run is real — a direction, with the curve
    // below as its evidence.
    trend && trend.risingMonths >= 3 && trend.sinceMonthName
      ? `Rising since ${trend.sinceMonthName}`
      : projection && latestMean !== undefined
        ? `${projection.direction} · ${toDegrees(latestMean)}°`
        : count > 0
          ? `Today · ${toDegrees(points[count - 1]!.rate)}° so far`
          : null;
  const readoutText = focusedPoint
    ? `${bucketLabel(focusedPoint)} · ${toDegrees(focusedPoint.rate)}°${focusedPoint.pending ? ' so far' : ''}`
    : restingText;

  const since = series.sinceISO ? hijriParts(series.sinceISO) : null;
  const a11y = `Your whole record as one line, ${count} points${series.bucketDays > 1 ? ` of ${series.bucketDays} days each` : ''}. ${restingText ?? ''}`;
  const step = (by: number) => {
    const next = (focused ?? count - 1) + by;
    if (next < 0 || next > count - 1) return;
    haptics.selection();
    setFocused(next);
  };

  if (count === 0) return null;

  return (
    <StatCard>
      <View style={styles.head}>
        {/* The record's opening, said once, so the span has an anchor without a ruler under it. */}
        <StatCardHeader title="Over time" trailing={since ? `since ${since.monthName} ${since.year}` : undefined} />
        {readoutText ? (
          <StatReadout text={readoutText} refreshKey={focused ?? 'resting'} />
        ) : null}
      </View>

      <GestureDetector gesture={gesture}>
        <View style={styles.chart} onLayout={onLayout} accessible accessibilityRole="adjustable"
          accessibilityLabel={a11y}
          accessibilityValue={{ text: readoutText ?? '' }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
          {width > 0 ? (
            <Svg width={width} height={BOX.height} viewBox={`0 0 ${width} ${BOX.height}`}>
              <Defs>
                <LinearGradient id={areaFillId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={theme.accent} stopOpacity={0.20} />
                  <Stop offset="0.6" stopColor={theme.accent} stopOpacity={0.05} />
                  <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {/* The floor the curve rests on. */}
              <Line
                x1={BOX.padX}
                y1={BASELINE_Y}
                x2={width - BOX.padX}
                y2={BASELINE_Y}
                stroke={theme.accentTrack}
                strokeWidth={1}
              />

              {/* Now — the divide between what is settled and what is not. Dashed, so it reads apart
                  from the solid baseline by pattern rather than by a third grey. Unlabelled: it is
                  a structural mark, and the date belongs to the scrubber. */}
              {nowIndex >= 0 && projection ? (
                <Line
                  x1={at(nowIndex, 0).x}
                  y1={BOX.padY * 0.5}
                  x2={at(nowIndex, 0).x}
                  y2={BASELINE_Y}
                  stroke={theme.accentTrackMuted}
                  strokeWidth={1}
                  strokeDasharray="2 5"
                />
              ) : null}

              {settledPaths.area ? <Path d={settledPaths.area} fill={`url(#${areaFillId})`} /> : null}

              {settledPaths.line ? (
                <AnimatedPath
                  d={settledPaths.line}
                  stroke={theme.accent}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={settledLength}
                  animatedProps={settledProps}
                />
              ) : null}

              {unsettledPath ? (
                <AnimatedG animatedProps={unsettledProps}>
                  <Path
                    d={unsettledPath}
                    stroke={theme.accent}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="2 5"
                    fill="none"
                  />
                  <Caret points={unsettled} color={theme.accent} />
                </AnimatedG>
              ) : null}

              {/* The span still running: hollow, because it is not finished being true. The only
                  mark on the curve at rest — the readings themselves are what the scrubber is for,
                  and a dot per bucket across a record is texture, not information. */}
              {nowPoint ? (
                <Circle
                  cx={nowPoint.x}
                  cy={nowPoint.y}
                  r={CURRENT_R}
                  fill={theme.backgroundElement}
                  stroke={points[nowIndex]!.rate >= 1 ? theme.complete : theme.accent}
                  strokeWidth={2}
                />
              ) : null}

              {/* The scrub cursor — present only while a finger is. */}
              <AnimatedLine
                y1={BOX.padY * 0.5}
                y2={BASELINE_Y}
                stroke={theme.accent}
                strokeWidth={1}
                animatedProps={cursorProps}
              />
              {focusedPoint && focusedPoint.possible > 0 ? (
                <AnimatedCircle
                  cx={at(focused!, focusedPoint.rate).x}
                  cy={at(focused!, focusedPoint.rate).y}
                  r={CURRENT_R}
                  fill={focusedPoint.rate >= 1 ? theme.complete : theme.accent}
                  animatedProps={focusProps}
                />
              ) : null}
            </Svg>
          ) : null}

          {/* Nothing to draw yet — name the empty space rather than present a bare floor, which
              reads as a chart that failed. */}
          {closed.length === 0 ? (
            <View style={styles.empty} pointerEvents="none">
              <ThemedText type="small" themeColor="textSecondary">
                Your line begins tomorrow.
              </ThemedText>
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </StatCard>
  );
}

/**
 * The arrowhead on the dashed run — a small triangle laid along the last segment's heading, so the
 * line ends in a direction rather than simply stopping. Nothing is drawn below two points: there is
 * no heading to point in.
 */
function Caret({ points, color }: { points: readonly Pt[]; color: string }) {
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  if (!tip || !prev) return null;
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const L = 7; // length along the heading
  const W = 4; // half-width across it
  const baseX = tip.x - ux * L;
  const baseY = tip.y - uy * L;
  return (
    <Polygon
      points={`${tip.x},${tip.y} ${baseX - uy * W},${baseY + ux * W} ${baseX + uy * W},${baseY - ux * W}`}
      fill={color}
    />
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

const styles = StyleSheet.create({
  head: { gap: Spacing.two },
  chart: { width: '100%', height: BOX.height },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
