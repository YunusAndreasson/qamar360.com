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

import { Segmented } from '@/components/segmented';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Duration, PageEnter } from '@/constants/motion';
import { Radius, Spacing } from '@/constants/theme';
import type { RecordSeries, SeriesPeriod, SeriesPoint, TrendSummary } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { buildSmoothPaths, mean, pointAt, polylineLength, project, slotAtX, slotX, spanFor, type PlotBox, type Pt } from '@/lib/chart';
import { hijriParts } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { setPreference, usePreference } from '@/lib/preferences';
import { toDegrees } from '@/lib/progress';

// Taller than the 120 the small Insights charts use, and with real headroom at the top: this is the
// screen's second instrument, and a run of full orbits was jamming flat against the ceiling where a
// curve needs somewhere to sit.
//
// Asymmetric on purpose. Nothing in this chart is ever drawn below the baseline — no axis labels,
// no ticks; every mark terminates on it — so a bottom inset matching the top's 18 reserved a strip
// for no one, and as the last card on Progress that empty band read as slack under the whole
// screen. The plot area is unchanged (112pt, exactly as it was at height 148): the 14 comes off the
// dead space alone, so the curve keeps its full vertical range and its headroom.
const PAD_BOTTOM = 4;
const BOX: PlotBox = { height: 134, padY: 18, padBottom: PAD_BOTTOM, padX: 14 };
const BASELINE_Y = BOX.height - PAD_BOTTOM;

const CURRENT_R = 4.5;

/** Clearance between the average rule and its label — enough to read as attached, not sitting on it. */
const AVERAGE_LABEL_GAP = 3;
/** The label's own height (`smallCompact` is 14/16, plus a hair for the plate's padding), needed to
 *  hang it *above* the rule: an absolutely-positioned `top` places its edge, not its baseline. */
const AVERAGE_LABEL_HEIGHT = 15;

/** How far back the projection is fitted — recent shape only, so an old rhythm can't anchor it. */
const FIT_WINDOW = 14;
/** The furthest ahead the line ever looks, in buckets. */
const MAX_HORIZON = 6;

/** A bucket as a reading. One day says its date; a wider span says the day it ends on, which is the
 *  most recent thing in it and so the one you were looking for. */
function bucketLabel({ iso, endISO, pending }: SeriesPoint, period: SeriesPeriod): string {
  if (pending) return period === 'year' ? 'This month' : 'Today';
  const parts = hijriParts(endISO);
  if (!parts) return endISO;
  // A whole Hijri month has a name, and "1–30 Ṣafar" is a worse way to say it. Only the year view
  // draws month buckets, and only its unclipped ones run the calendar month end to end.
  const from = hijriParts(iso);
  if (period === 'year' && from?.day === 1 && from.month === parts.month) return `${parts.monthName} ${parts.year}`;
  const end = `${parts.day} ${parts.monthName}`;
  if (iso === endISO) return end;
  // Within one Hijri month say "8–14 Ṣafar"; across a boundary name both, or the pair reads as one.
  if (from && from.month === parts.month) return `${from.day}–${end}`;
  return from ? `${from.day} ${from.monthName} – ${end}` : end;
}

/** What the card's trailing caption says the line covers — the span, named the way the period is. */
function spanCaption(series: RecordSeries): string | undefined {
  const from = series.sinceISO ? hijriParts(series.sinceISO) : null;
  if (!from) return undefined;
  switch (series.period) {
    case 'month':
      return `${from.monthName} ${from.year}`;
    case 'year':
      return `${from.year} H`;
    case 'week':
      return `from ${from.day} ${from.monthName}`;
    case 'life':
      return `since ${from.monthName} ${from.year}`;
  }
}

/** How each period names itself on the selector. Narrowest first — the order they are offered in. */
const PERIOD_LABEL: Record<SeriesPeriod, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
  life: 'Lifetime',
};

/**
 * "Over time" — the record as one line, read over the period you choose.
 *
 * The screen's second instrument, and the only one that moves on a second day of use: the hero
 * measures the month you are in, this measures whether you are becoming someone who keeps it.
 *
 * **A period names a span, and its resolution follows from it** — a week is seven days, a month is
 * its own days, a year is its twelve months, a lifetime is bucketed only as far as it must be to
 * fit. So there is one control, it says what you get, and no setting can land on a line too dense
 * to read. This is what the old Days / Months / Years switch got backwards: it set the *grain*
 * while the span stayed fixed, which is why two of its three settings were empty for anyone new.
 * And it is why the three stacked cards before that were wrong in the other direction — showing
 * days, months and years at once invited comparisons between scales that aren't comparable. One
 * graph showing one scale at a time invites nothing of the kind. A period appears only once the
 * record can fill it with something a wider one doesn't already say, so the control is absent
 * until there is genuinely a choice.
 *
 * The line's grammar is one rule: **solid is settled, dashed is not.** A solid curve runs through
 * what is closed; a dashed one carries on through the span still being lived and out to where the
 * fitted slope is heading, ending in a caret. The future is drawn in the same ink as the present
 * and marked as provisional — direction without a promise. The average is the one exception drawn
 * flat and solid in a track tone: it is not a reading, it is the floor the readings are measured
 * against, and it is the only absolute reference the plot has.
 *
 * Nothing names a date until you ask. At rest the card says which way you are going and where you
 * are; the calendar appears under your finger and leaves with it, because a date printed on the
 * axis is a label you read once and then have to keep ignoring.
 */
export function OverTime({
  seriesByPeriod,
  periods,
  trend,
}: {
  seriesByPeriod: Record<SeriesPeriod, RecordSeries>;
  periods: SeriesPeriod[];
  trend: TrendSummary | null;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const areaFillId = `overTimeArea-${useId()}`;

  // The remembered choice, but only where the record can still honour it — a person who last read
  // the Year view on another device, or before a reset, must not land on a period this record has
  // nothing to draw for. Falling back to the widest offered is always safe: `life` is always there.
  const saved = usePreference('progressPeriod');
  const period = periods.includes(saved) ? saved : periods[periods.length - 1]!;
  const series = seriesByPeriod[period];

  const points = series.points;
  const count = points.length;

  // Closed buckets carry the settled curve; the one still running and the projection carry the dash.
  //
  // **A bucket's own rate is the value — there is no second, smoothed series.** The curve used to be
  // drawn through a trailing mean while the scrub dot and the readout used the raw rate, so the two
  // disagreed by construction: the dot landed off the line and reported a number the line was not
  // showing. Legibility is the cubic's job, and the bucket width already averages as the record
  // grows, so the smoothing bought a mismatch and nothing else. One array, one meaning: what you
  // scrub is what is drawn is what is said.
  const closed = useMemo(() => points.map((p, i) => ({ p, i })).filter((x) => x.p.possible > 0 && !x.p.pending), [points]);

  // Room ahead grows with what is behind: a quarter of the record, capped. A fixed horizon would
  // swallow half the plot on a two-day chart and read as mostly speculation.
  const horizon = count > 0 ? Math.min(MAX_HORIZON, Math.max(1, Math.round(count / 4))) : 0;
  const projection = useMemo(
    // Fitted on closed buckets only. A day still being lived reads near zero in the morning, and a
    // forecast that dives at breakfast and recovers by night is noise wearing the clothes of a trend.
    () => (horizon > 0 ? project(closed.map((x) => x.p.rate), { horizon, fitWindow: FIT_WINDOW }) : null),
    [horizon, closed],
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

  const settled: Pt[] = width > 0 ? closed.map((x) => at(x.i, x.p.rate)) : [];
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

  // The plot's one absolute reference. Without it a curve sitting at mid-height says only "some
  // middling amount" — the line has no axis, no gridline and no ceiling, so height alone means
  // nothing you can name. Averaged over the buckets ON SCREEN, not the whole record, because the
  // question it answers is "is this period above or below my usual", and the period is the choice
  // the reader just made.
  const average = useMemo(() => mean(closed.map((x) => x.p.rate)), [closed]);
  const averageY = width > 0 && average !== null ? pointAt(0, average, width, BOX).y : null;
  const averageEndX = settled.length > 0 ? settled[settled.length - 1]!.x : 0;

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
    const raw = slotAtX(x, total, w, BOX);
    // Never past the last real bucket: the projection is where you are heading, not somewhere you
    // can stand and take a reading.
    const i = raw > count - 1 ? count - 1 : raw;
    // The cursor is placed by the same function that places the curve's points, so the two cannot
    // drift apart — the hairline lands exactly on the slot whose reading is being shown.
    cursorX.set(slotX(i, total, w, BOX));
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
  const latest = closed[closed.length - 1]?.p.rate;
  const focusedPoint = focused != null ? (points[focused] ?? null) : null;
  const restingText =
    // The screen's one multi-month sentence, when the run is real — a direction, with the curve
    // below as its evidence.
    trend && trend.risingMonths >= 3 && trend.sinceMonthName
      ? `Rising since ${trend.sinceMonthName}`
      : projection && latest !== undefined
        ? `${projection.direction} · ${toDegrees(latest)}°`
        : count > 0
          ? `Today · ${toDegrees(points[count - 1]!.rate)}° so far`
          : null;
  const readoutText = focusedPoint
    ? // A span that asked nothing has no reading. "0°" would be a score for something that was never
      // yours to keep — the same reason the curve leaves its slot empty rather than dropping to the
      // floor, said in words.
      focusedPoint.possible === 0
      ? `${bucketLabel(focusedPoint, period)} · nothing due`
      : `${bucketLabel(focusedPoint, period)} · ${toDegrees(focusedPoint.rate)}°${focusedPoint.pending ? ' so far' : ''}`
    : restingText;

  // "of N days each" only where the buckets have a width to name — a year's are calendar months.
  const grain = period === 'year' ? ' of one Hijri month each' : series.bucketDays > 1 ? ` of ${series.bucketDays} days each` : '';
  const a11y = `Your record over the ${PERIOD_LABEL[period].toLowerCase()}, ${count} points${grain}.${average !== null ? ` Averaging ${toDegrees(average)} degrees.` : ''} ${restingText ?? ''}`;
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
        {/* What the line covers, said once, so the span has an anchor without a ruler under it. */}
        <StatCardHeader title="Over time" trailing={spanCaption(series)} />
        {readoutText ? (
          <StatReadout text={readoutText} refreshKey={`${period}:${focused ?? 'resting'}`} />
        ) : null}
      </View>

      {/* Absent until the record can fill more than one period — a control with a single setting
          is a label pretending to be a choice. */}
      {periods.length > 1 ? (
        <Segmented
          options={periods.map((p) => ({ value: p, label: PERIOD_LABEL[p], accessibilityLabel: `Read the ${PERIOD_LABEL[p].toLowerCase()}` }))}
          value={period}
          onChange={(next) => setPreference('progressPeriod', next)}
        />
      ) : null}

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

              {/* The average of what is drawn — solid, and in a track tone, because it is furniture
                  rather than a reading. A DASHED rule would be read as a projection: this chart
                  spends its dashes on "not settled yet" and can't spend them twice. It stops at the
                  last settled point for the same reason — it describes closed buckets, so running
                  it out under the forecast would claim it covers that too. */}
              {averageY !== null ? (
                <Line
                  x1={BOX.padX}
                  y1={averageY}
                  x2={averageEndX}
                  y2={averageY}
                  stroke={theme.accentTrackStrong}
                  strokeWidth={1}
                />
              ) : null}

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
                  {/* The caret claims a heading, which only a fitted slope has earned — without
                      one (too little closed history to fit) the dashed run still bridges to
                      today's live reading, but ends plainly rather than pointing anywhere. */}
                  {projection ? <Caret points={unsettled} color={theme.accent} /> : null}
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

          {/* The rule's direct label. Drawn in RN text rather than SVG so it wears the app's own
              type and colour roles. It sits at the left edge, clear of the forecast, and flips to
              whichever side of the rule the curve is NOT on where it opens.
              It also carries the card's own background as a plate. The flip only knows where the
              curve STARTS — a lifetime line that climbs steeply a few points in walks straight
              through the text either way, and on this record it did. A label you have to read
              through a stroke is not a label; the plate costs a few pixels of the area fill and
              makes the reference legible whatever shape the curve turns out to be. */}
          {averageY !== null ? (
            <ThemedText
              type="smallCompact"
              themeColor="textSecondary"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.averageLabel,
                { backgroundColor: theme.backgroundElement },
                {
                  top:
                    averageY +
                    (settled[0] && settled[0].y < averageY
                      ? AVERAGE_LABEL_GAP
                      : -AVERAGE_LABEL_GAP - AVERAGE_LABEL_HEIGHT),
                },
              ]}
              pointerEvents="none">
              avg {toDegrees(average!)}°
            </ThemedText>
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
  averageLabel: {
    position: 'absolute',
    left: BOX.padX + 2,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.control,
    overflow: 'hidden', // Android clips a Text's background to its radius only when told to
  },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
