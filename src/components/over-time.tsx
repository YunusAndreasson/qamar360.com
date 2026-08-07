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

import { Segmented, type SegmentedOption } from '@/components/segmented';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Duration, PageEnter } from '@/constants/motion';
import { DenseLabelScale, Spacing } from '@/constants/theme';
import type { DayPoint, LifeProgress, LifeYear, TrendSummary, YearMonth, YearProgress } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { buildPaths, pointAt, polylineLength, project, spanFor, trailingMean, type PlotBox, type Pt } from '@/lib/chart';
import { hijriParts } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { toDegrees } from '@/lib/progress';

const BOX: PlotBox = { height: 120, padY: 12, padX: 12 };
const BASELINE_Y = BOX.height - BOX.padY;
/** Half an axis label box — labels are centred on their slot and clamped to the plot's edges. */
const LABEL_W = BOX.padX * 2;

const RAW_R = 1.75;
const DOT_R = 3;
const CURRENT_R = 4.5;
const FUTURE_R = 2.5;

/**
 * The daily line's trailing window. Seven days is one turn of the weekly schedule most habits run
 * on, so a Monday-only act stops reading as six misses and a spike. The window is a ceiling, not a
 * requirement — {@link trailingMean} averages whatever exists, so a second day of use already draws
 * a real two-point line. Month and year marks are already whole-period aggregates and are not
 * smoothed again (window 1).
 */
const DAILY_TREND_WINDOW = 7;
/** How far back the projection is fitted — recent shape only, so an old rhythm can't anchor it. */
const FIT_WINDOW = 14;
/** The furthest ahead the daily chart ever looks. A fortnight of extrapolation is already generous. */
const MAX_HORIZON = 7;

type Zoom = 'days' | 'months' | 'years';

/** One slot of whichever scale is showing — a day, a Hijri month, or a Hijri year. */
type Mark = {
  key: string | number;
  /** 0–1 completion for that period. */
  rate: number;
  /** Whether the period carries a reading at all; a slot without one is left empty, never floored. */
  signal: boolean;
  /** The period still running — drawn provisionally, and kept out of the fit. */
  pending: boolean;
  /** The line under the header while this slot is being read. */
  readout: string;
  /** The same reading spoken. */
  a11y: string;
  /** Axis label, when this scale rules one under every slot. */
  label?: string;
};

type Series = {
  marks: Mark[];
  /** Card header's trailing caption — what the x-axis spans. */
  span: string;
  /** The header's reading at rest, before anything is scrubbed. */
  resting: string | null;
  /** Shown in place of a chart when there is nothing yet to draw. */
  empty: string | null;
  /** Trailing-mean window; 1 leaves already-aggregated marks alone. */
  window: number;
  /** Slots reserved past the last mark for the projection — the daily scale's room to look ahead. */
  futureSlots: number;
  /** Whether a projection is drawn at all. */
  projects: boolean;
};

/** A day as a reading: "12 Ṣafar · 240°", today tagged the way every scale tags its running slot. */
function dayReadout(p: DayPoint, degrees: number): string {
  const parts = hijriParts(p.iso);
  const when = parts ? `${parts.day} ${parts.monthName}` : p.iso;
  if (p.pending) return `Today · ${degrees}° so far`;
  if (p.possible === 0) return `${when} · nothing due`;
  return `${when} · ${degrees}°`;
}

/** The daily scale: one point per day since the record opened, up to a season. */
function daySeries(daily: DayPoint[]): Series {
  // Start where the record starts, not where the window does — a second-day user gets two slots
  // across the whole card, not two dots crushed against the right edge.
  const opened = daily.findIndex((p) => p.possible > 0);
  const marks: Mark[] =
    opened < 0
      ? []
      : daily.slice(opened).map((p) => {
          const degrees = toDegrees(p.rate);
          return {
            key: p.iso,
            rate: p.rate,
            signal: p.possible > 0,
            pending: p.pending,
            readout: dayReadout(p, degrees),
            a11y: dayReadout(p, degrees).replace('°', ' degrees'),
          };
        });

  // The room ahead grows with the record: a quarter of what is behind you, capped at a week. A
  // fixed week would swallow half the plot on a two-day chart and read as mostly speculation.
  const futureSlots = marks.length > 0 ? Math.min(MAX_HORIZON, Math.max(1, Math.round(marks.length / 4))) : 0;

  return {
    marks,
    span: marks.length === 1 ? '1 day' : `${marks.length} days`,
    resting: null, // filled by the caller from the fitted direction — it needs the trend
    empty: marks.length === 0 ? 'Your days draw here as you keep them.' : null,
    window: DAILY_TREND_WINDOW,
    futureSlots,
    projects: true,
  };
}

/** A month as a reading, the grammar the year strip has always used. */
function monthReadout(m: YearMonth): string {
  if (m.state === 'future') return `${m.monthName} · upcoming`;
  const value = `${toDegrees(m.fraction)}°`;
  return m.state === 'current' ? `${m.monthName} · ${value} · this month` : `${m.monthName} · ${value}`;
}

/** The month scale: this Hijri year's twelve months — unchanged from the year strip it replaces. */
function monthSeries(year: YearProgress, trend: TrendSummary | null): Series {
  const marks: Mark[] = year.months.map((m) => ({
    key: m.month,
    rate: m.fraction,
    signal: m.state !== 'future',
    pending: m.state === 'current',
    readout: monthReadout(m),
    a11y:
      m.state === 'future'
        ? `${m.monthName}, upcoming`
        : `${m.monthName}, ${toDegrees(m.fraction)} degrees complete${m.state === 'current' ? ', this month' : ''}`,
    // Numerals 1–12, one under every dot: an evenly-ruled axis. A sparse named axis was tried and
    // read worse — uneven label spacing obscured the grid.
    label: String(m.month),
  }));
  const current = year.months.find((m) => m.state === 'current') ?? null;
  return {
    marks,
    span: `${year.year} H`,
    // The screen's one multi-month sentence, when the run is real; else today's month. A direction,
    // not a number — the chart below is the evidence.
    resting:
      trend && trend.risingMonths >= 3 && trend.sinceMonthName
        ? `Rising since ${trend.sinceMonthName}`
        : current
          ? monthReadout(current)
          : null,
    empty: null,
    window: 1,
    futureSlots: 0,
    projects: true, // across the year's remaining months, which already hold slots
  };
}

/** The year scale: every Hijri year on record. */
function yearSeries(life: LifeProgress): Series {
  const marks: Mark[] = life.years.map((y: LifeYear) => ({
    key: y.year,
    rate: y.fraction,
    signal: true,
    pending: y.state === 'current',
    readout:
      y.state === 'current' ? `${y.year} · ${toDegrees(y.fraction)}° · this year` : `${y.year} · ${toDegrees(y.fraction)}°`,
    a11y: `${y.year} H, ${toDegrees(y.fraction)} degrees complete${y.state === 'current' ? ', this year' : ''}`,
    label: String(y.year),
  }));
  const first = life.years[0];
  const last = life.years[life.years.length - 1];
  return {
    marks,
    span: first && last && first.year !== last.year ? `${first.year}–${last.year} H` : `${first?.year ?? ''} H`,
    // Where the record opens — the one fact a lifetime view owes you that no mark can show.
    resting: `Since ${life.sinceMonthName} ${life.sinceYear}`,
    empty: null,
    window: 1,
    // A projected year is a fantasy: one fitted step spans twelve months of a life. The running
    // year still connects with the unsettled dash — that is a reading, not a forecast.
    futureSlots: 0,
    projects: false,
  };
}

/**
 * "Over time" — the record as one line, at whichever scale you ask for.
 *
 * The screen's second instrument, and the only one that moves on a second day of use: the hero
 * measures the month you are in, this measures whether you are becoming someone who keeps it. Days,
 * months and years are the same chart at three zooms rather than three cards, because two line
 * charts stacked invite the eye to compare scales that aren't comparable — and because a scale a
 * new user cannot fill is a dead card, not a feature.
 *
 * The line's grammar is one rule: **solid is settled, dashed is not.** A solid stroke runs through
 * the closed periods; a dashed one carries on through the period still running and out into where
 * the fitted slope is heading, ending in a caret. So the future is drawn in the same ink as the
 * present, marked as provisional — direction without a promise.
 *
 * Scrub the plot to read any slot; the cursor is only there while your finger is.
 */
export function OverTime({
  daily,
  year,
  life,
  trend,
}: {
  daily: DayPoint[];
  year: YearProgress | null;
  life: LifeProgress | null;
  trend: TrendSummary | null;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const areaFillId = `overTimeArea-${useId()}`;

  // A zoom is offered only once it has something to say: a single month is not a trend, and a
  // single year is not a life. So the control appears as the record grows into it rather than
  // presenting a new user with scales that are all empty.
  const zooms = useMemo(() => {
    const options: SegmentedOption<Zoom>[] = [{ value: 'days', label: 'Days' }];
    if (year && year.months.filter((m) => m.state !== 'future').length >= 2) {
      options.push({ value: 'months', label: 'Months' });
    }
    if (life && life.years.length >= 2) options.push({ value: 'years', label: 'Years' });
    return options;
  }, [year, life]);

  const [chosen, setChosen] = useState<Zoom>('days');
  // A zoom can vanish under the user between refetches (a signed-out reload, a cleared history).
  // Fall back rather than render a series that is no longer there.
  const zoom = zooms.some((o) => o.value === chosen) ? chosen : 'days';

  const series = useMemo(() => {
    if (zoom === 'months' && year) return monthSeries(year, trend);
    if (zoom === 'years' && life) return yearSeries(life);
    return daySeries(daily);
  }, [zoom, daily, year, life, trend]);

  const { marks, futureSlots } = series;

  // ── The three paths ──────────────────────────────────────────────────────────────────────────
  // Closed periods carry the settled line; the running one and the projection carry the dashed.
  const closed = useMemo(() => marks.map((m, i) => ({ m, i })).filter((x) => x.m.signal && !x.m.pending), [marks]);
  const means = useMemo(() => trailingMean(closed.map((x) => x.m.rate), series.window), [closed, series.window]);
  // Where the projection lands: the reserved slots past the last day, or — at a scale whose future
  // already holds slots (the year's remaining months) — those. A scale with neither doesn't project.
  const projectionStart = futureSlots > 0 ? marks.length : marks.findIndex((m) => !m.signal && !m.pending);
  const projection = useMemo(() => {
    if (!series.projects || projectionStart < 0) return null;
    const horizon = futureSlots > 0 ? futureSlots : marks.length - projectionStart;
    if (horizon <= 0) return null;
    // Fitted on closed periods only. A day still being lived reads near zero in the morning, and a
    // forecast that dives at breakfast and recovers by night is noise wearing the clothes of a
    // trend. So the caret arrives on the third day; the dashed run to today already shows which way
    // the last two went, and moves live as the day is kept.
    return project(means, { horizon, fitWindow: FIT_WINDOW });
  }, [series.projects, projectionStart, futureSlots, marks.length, means]);

  // The room ahead is only real if something is drawn in it. Without a projection the reserved
  // slots would shove the record left for no reason — and a lone first day would sit pinned to the
  // edge instead of centred.
  const total = marks.length + (projection ? futureSlots : 0);

  const [width, setWidth] = useState(0);
  const widthSV = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.set(w);
  };

  const at = (index: number, rate: number): Pt => pointAt(spanFor(index, total), rate, width, BOX);

  const settled: Pt[] = width > 0 ? closed.map((x, k) => at(x.i, means[k]!)) : [];
  const pendingIndex = marks.findIndex((m) => m.pending && m.signal);
  const pendingPoint = width > 0 && pendingIndex >= 0 ? at(pendingIndex, marks[pendingIndex]!.rate) : null;
  // The dashed run: on from the settled line, through the period still open, out to where the
  // slope points. Its first point is the last settled one so the two read as one stroke.
  const unsettled: Pt[] =
    width > 0
      ? [
          ...(settled.length > 0 ? [settled[settled.length - 1]!] : []),
          ...(pendingPoint ? [pendingPoint] : []),
          ...(projection?.values ?? []).map((v, k) => at(projectionStart + k, v)),
        ]
      : [];

  const settledPaths = buildPaths(settled, BASELINE_Y);
  const unsettledPath = buildPaths(unsettled, BASELINE_Y).line;
  const settledLength = polylineLength(settled);

  // The line draws on as the page settles — the hero's orbit sweep at chart scale. The effect fires
  // on layout, so the delay shapes the entrance only, never a refetch. Instant under Reduce Motion.
  const reveal = useSharedValue(0);
  useEffect(() => {
    if (width <= 0) return;
    reveal.set(
      reduceMotion
        ? 1
        : withDelay(PageEnter.second, withTiming(1, { duration: Duration.orbit, easing: Easing.out(Easing.cubic) })),
    );
  }, [width, zoom, reduceMotion, reveal]);
  const settledProps = useAnimatedProps(() => ({ strokeDashoffset: settledLength * (1 - reveal.get()) }));
  // The dashed run can't draw on — a dash offset is already spoken for by its pattern — so it
  // surfaces instead, arriving as the solid stroke lands.
  const unsettledProps = useAnimatedProps(() => ({ opacity: 0.5 * reveal.get() }));

  // ── Scrub ────────────────────────────────────────────────────────────────────────────────────
  // The reading is stamped with the scale it was taken at: an index means a different period at
  // every zoom, so a stale one is simply not this zoom's reading. Derived rather than reset in an
  // effect — there is no external state to synchronise, only a value that stops applying.
  const [focus, setFocus] = useState<{ zoom: Zoom; index: number } | null>(null);
  const focused = focus && focus.zoom === zoom ? focus.index : null;

  const cursorX = useSharedValue(0);
  const cursorOn = useSharedValue(0);
  const lastIndex = useSharedValue(-1);
  const markCount = marks.length;

  const changeZoom = (next: Zoom) => {
    setChosen(next);
    cursorOn.set(0);
    lastIndex.set(-1);
  };

  const focusAt = (index: number) => setFocus({ zoom, index });
  const tick = () => haptics.selection();
  const moveTo = (x: number) => {
    'worklet';
    const w = widthSV.get();
    if (w <= 0 || markCount === 0) return;
    const inner = Math.max(1, w - 2 * BOX.padX);
    const raw = Math.round(((x - BOX.padX) / inner) * (total > 1 ? total - 1 : 1));
    // Never past the last real slot: the projection is where you are heading, not somewhere you
    // can stand and take a reading.
    const i = raw < 0 ? 0 : raw > markCount - 1 ? markCount - 1 : raw;
    cursorX.set(BOX.padX + inner * (total > 1 ? i / (total - 1) : 0.5));
    cursorOn.set(1);
    if (lastIndex.get() === i) return; // ratchet: one beat per slot crossed, never per frame
    lastIndex.set(i);
    scheduleOnRN(focusAt, i);
    scheduleOnRN(tick);
  };
  const release = () => {
    'worklet';
    cursorOn.set(withTiming(0, { duration: Duration.fast }));
    lastIndex.set(-1); // so the next scrub re-ticks even on the same slot
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
  // A tap reads a single slot. `maxDistance` is load-bearing: without it a vertical scroll drag
  // still ends in a recognised tap, and flicking the page would take a reading on the way past.
  const read = useTapGesture({ maxDistance: 8, onActivate: (e) => moveTo(e.x), onFinalize: () => release() });
  const gesture = useCompetingGestures(scrub, read);

  const cursorProps = useAnimatedProps(() => ({ x1: cursorX.get(), x2: cursorX.get(), opacity: cursorOn.get() }));
  const focusProps = useAnimatedProps(() => ({ opacity: cursorOn.get() }));

  // ── The reading ──────────────────────────────────────────────────────────────────────────────
  const latestMean = means[means.length - 1];
  const restingText =
    series.resting ??
    (projection && latestMean !== undefined
      ? `${projection.direction} · ${toDegrees(latestMean)}°`
      : (marks[marks.length - 1]?.readout ?? null));
  const focusedMark = focused != null ? (marks[focused] ?? null) : null;
  const readoutText = focusedMark ? focusedMark.readout : restingText;

  const a11ySummary = `${marks.length} ${zoom === 'days' ? 'days' : zoom === 'months' ? 'months' : 'years'} of record. ${
    focusedMark?.a11y ?? restingText ?? ''
  }`;
  const step = (by: number) => {
    const next = (focused ?? markCount - 1) + by;
    if (next < 0 || next > markCount - 1) return;
    haptics.selection();
    focusAt(next);
  };

  const nowIndex = marks.findIndex((m) => m.pending);
  const hasLabels = marks.some((m) => m.label);
  // Per-slot dots are the reading at a scale you can count; across a season they would be a smear,
  // so the daily chart lets its own raw marks be the dots.
  const showMarkDots = marks.length <= 24;

  return (
    <StatCard>
      <View style={styles.head}>
        <StatCardHeader title="Over time" trailing={series.span} />
        {zooms.length > 1 ? <Segmented options={zooms} value={zoom} onChange={changeZoom} /> : null}
        {readoutText ? (
          <StatReadout text={readoutText} refreshKey={`${zoom}:${focused ?? 'resting'}`} />
        ) : null}
      </View>

      <GestureDetector gesture={gesture}>
        {/* Chart and axis share one plot so the scrub reads across the full height, not a 3px dot. */}
        <View style={styles.plot}>
          <View
            style={styles.chart}
            onLayout={onLayout}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={a11ySummary}
            accessibilityValue={{ text: focusedMark?.a11y ?? restingText ?? '' }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
            {series.empty ? (
              <View style={styles.empty} pointerEvents="none">
                <ThemedText type="small" themeColor="textSecondary">
                  {series.empty}
                </ThemedText>
              </View>
            ) : null}

            {width > 0 ? (
              <Svg width={width} height={BOX.height} viewBox={`0 0 ${width} ${BOX.height}`}>
                <Defs>
                  <LinearGradient id={areaFillId} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={theme.accent} stopOpacity={0.22} />
                    <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
                  </LinearGradient>
                </Defs>

                {/* The floor the line rests on. */}
                <Line
                  x1={BOX.padX}
                  y1={BASELINE_Y}
                  x2={width - BOX.padX}
                  y2={BASELINE_Y}
                  stroke={theme.accentTrack}
                  strokeWidth={1}
                />

                {/* Now — the divide between what is settled and what is not. Dashed, so it reads
                    apart from the solid baseline by pattern rather than by a third grey. */}
                {nowIndex >= 0 ? (
                  <Line
                    x1={at(nowIndex, 0).x}
                    y1={BOX.padY * 0.5}
                    x2={at(nowIndex, 0).x}
                    y2={BASELINE_Y}
                    stroke={theme.accentTrack}
                    strokeWidth={1}
                    strokeDasharray="3 4"
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
                      strokeDasharray="3 5"
                      fill="none"
                    />
                    <Caret points={unsettled} color={theme.accent} />
                  </AnimatedG>
                ) : null}

                {marks.map((m, i) => {
                  if (!m.signal) {
                    // A period not yet BEGUN waits on the floor — a mark, not a reading. A day that
                    // has passed with nothing due gets no mark at all: on the floor it would read
                    // as a miss, which is the one thing it certainly wasn't.
                    return nowIndex >= 0 && i > nowIndex ? (
                      <Circle key={m.key} cx={at(i, 0).x} cy={BASELINE_Y} r={FUTURE_R} fill={theme.accentTrackMuted} />
                    ) : null;
                  }
                  if (m.pending) return null; // drawn hollow below, on top of the dashed run
                  const p = at(i, m.rate);
                  // A countable scale puts a real dot on the line, and a period fully kept wears
                  // the warm done tone — the app's two temperatures, on a mark you can actually
                  // count. A season's days are texture, not readings: they stay one quiet tone
                  // however many were perfect. Ninety warm dots would be the brightest thing on the
                  // screen, out-shouting the line they exist to corroborate — and the hero besides.
                  return (
                    <Circle
                      key={m.key}
                      cx={p.x}
                      cy={p.y}
                      r={showMarkDots ? DOT_R : RAW_R}
                      fill={showMarkDots ? (m.rate >= 1 ? theme.complete : theme.accent) : theme.accentTrackStrong}
                    />
                  );
                })}

                {/* The period still running: hollow, because it is not finished being true. */}
                {pendingPoint ? (
                  <Circle
                    cx={pendingPoint.x}
                    cy={pendingPoint.y}
                    r={CURRENT_R}
                    fill={theme.backgroundElement}
                    stroke={marks[pendingIndex]!.rate >= 1 ? theme.complete : theme.accent}
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
                {focusedMark && focusedMark.signal ? (
                  <AnimatedCircle
                    cx={at(focused!, focusedMark.rate).x}
                    cy={at(focused!, focusedMark.rate).y}
                    r={CURRENT_R}
                    fill={focusedMark.rate >= 1 ? theme.complete : theme.accent}
                    animatedProps={focusProps}
                  />
                ) : null}
              </Svg>
            ) : null}
          </View>

          {/* The axis. Scales that can rule a label under every slot do; the daily scale names only
              the divide it actually has — a ruler of relative day counts would be noise. */}
          <View style={styles.axis} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {width > 0 && hasLabels
              ? marks.map((m, i) => {
                  const { x } = at(i, 0);
                  const isNow = i === nowIndex;
                  return (
                    <View
                      key={m.key}
                      style={[styles.labelBox, { left: Math.max(0, Math.min(width - LABEL_W, x - LABEL_W / 2)) }]}>
                      <ThemedText
                        type={isNow ? 'smallCompactBold' : 'smallCompact'}
                        maxFontSizeMultiplier={DenseLabelScale}
                        style={{ color: isNow ? theme.accent : theme.textSecondary }}>
                        {m.label}
                      </ThemedText>
                    </View>
                  );
                })
              : null}
            {width > 0 && !hasLabels && nowIndex >= 0 ? (
              <View
                style={[
                  styles.labelBox,
                  { width: LABEL_W * 2, left: Math.max(0, Math.min(width - LABEL_W * 2, at(nowIndex, 0).x - LABEL_W)) },
                ]}>
                <ThemedText type="smallCompact" maxFontSizeMultiplier={DenseLabelScale} style={{ color: theme.accent }}>
                  today
                </ThemedText>
              </View>
            ) : null}
          </View>
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
  // The card's own gap separates head ↔ plot; inside the plot, chart ↔ axis keep the same rhythm.
  plot: { gap: Spacing.three },
  chart: { width: '100%', height: BOX.height },
  axis: { height: 16 },
  labelBox: { position: 'absolute', width: LABEL_W, alignItems: 'center' },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
