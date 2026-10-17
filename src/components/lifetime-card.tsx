import { useCallback, useEffect, useId, useMemo, useState } from 'react';
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
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Duration, PageEnter } from '@/constants/motion';
import { Radius, Spacing } from '@/constants/theme';
import { useLatestRef } from '@/hooks/use-latest-ref';
import type { RecordSeries, SeriesPoint } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { buildSmoothPaths, lineCrossesRect, mean, pointAt, polylineLength, slotAtX, slotX, spanFor, type PlotBox, type Pt } from '@/lib/chart';
import { hijriParts } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { formatDegrees } from '@/lib/progress-format';

/** The dot on a point: the hollow one on the span still running, and the solid one under a finger.
 *  The hollow one is stroked, so half that stroke hangs outside the radius — which is what makes
 *  {@link PAD_BOTTOM} the size it is. */
const CURRENT_R = 4.5;
const CURRENT_STROKE = 2;

/** The curve's own vertical range, held fixed so clearance can never be taken out of it. */
const PLOT_HEIGHT = 112;
/** Headroom above a full orbit: this is the screen's second instrument, and a run of full months
 *  was jamming flat against the ceiling where a curve needs somewhere to sit. */
const PAD_TOP = 18;
/**
 * Clearance below the baseline — the deepest any mark reaches past its own point.
 *
 * Asymmetric on purpose, and it does NOT mirror the top. No axis labels and no ticks hang below the
 * baseline, and the curve cannot dip under its own lowest point (the tangents are monotone), so the
 * bottom needs nothing like 18; a strip that wide reserved space for no one, and as the last card
 * on Progress it read as slack under the whole screen.
 *
 * But it is not zero either, and a flat 4 was too small. Both dots are centred ON their point, and
 * a span with nothing done in it yet puts that point exactly on the baseline — so half a dot hangs
 * below, 5.5pt for the stroked one. It was rendering with its bottom sliced off against the edge of
 * the SVG every morning, before the day's first tick. So the inset is derived from the mark rather
 * than guessed, and the height carries it: the plot keeps all 112pt of its range.
 */
const PAD_BOTTOM = Math.ceil(CURRENT_R + CURRENT_STROKE / 2);
const BOX: PlotBox = { height: PLOT_HEIGHT + PAD_TOP + PAD_BOTTOM, padY: PAD_TOP, padBottom: PAD_BOTTOM, padX: 14 };
const BASELINE_Y = BOX.height - PAD_BOTTOM;

/** Clearance between the average rule and its label — enough to read as attached, not sitting on it. */
const AVERAGE_LABEL_GAP = 3;
/** The label's own height — `smallCompact`'s 16pt line box, with no vertical padding to add to it.
 *  Needed because an absolutely-positioned `top` places the plate's EDGE, not the text's baseline,
 *  so every decision about what the plate would cover is made from this number. */
const AVERAGE_LABEL_HEIGHT = 16;
/** The widest the label gets ("Avg 360°"), for deciding what its plate would cover before it is
 *  laid out. A little generous on purpose: a spot judged clear must be clear. */
const AVERAGE_LABEL_WIDTH = 72;
/** How far in from the rule's end the label sits, at either end. */
const AVERAGE_LABEL_INSET = 2;

/** A bucket as a reading. One day says its date; a wider span says the day it ends on, which is the
 *  most recent thing in it and so the one you were looking for. */
function bucketLabel({ iso, endISO, pending }: SeriesPoint): string {
  // A pending bucket is named for the span it MEASURES, not for the day you happen to read it on.
  // The record buckets by however many days it takes to fit on one line (`lifeBucketDays`): single
  // days while it is young, so "Today" is exactly right, and usually several days once it is not —
  // calling that "Today" would hang a one-day label on a multi-day number. Anything wider than a
  // day names its own range instead.
  if (pending && iso === endISO) return 'Today';
  const parts = hijriParts(endISO);
  if (!parts) return endISO;
  const from = hijriParts(iso);
  const end = `${parts.day} ${parts.monthName}`;
  if (iso === endISO) return end;
  // Within one Hijri month say "8–14 Ṣafar"; across a boundary name both, or the pair reads as one.
  if (from && from.month === parts.month) return `${from.day}–${end}`;
  return from ? `${from.day} ${from.monthName} – ${end}` : end;
}

/**
 * How much of the record the card covers, for the top right of its header: the Hijri year it
 * began in. The record ends today, so only its start needs saying, and the year alone says it; the
 * month it began in is a detail the scrub gives to anyone who goes looking. Keeps its "H": a bare
 * "1447" in a stats card reads as a count.
 */
function spanLabel({ points }: RecordSeries): string | null {
  const first = points[0];
  const from = first ? hijriParts(first.iso) : null;
  return from ? `Since ${from.year} H` : null;
}

/**
 * The whole record, as a line: the widest step of the screen's zoom-out (the moon's month, the
 * year's twelve moons, everything).
 *
 * The line's grammar is one rule: **solid is settled, dashed is not.** A solid curve runs through
 * what is closed, and a dashed one carries on to the span still being lived. Nothing is drawn past
 * today: a forecast (a dashed run out to a fitted slope, an arrowhead, a "now" divider) was cut on
 * 2026-10-17 as three guesses on a screen about one stripe. The average is drawn flat and solid in a
 * track tone: it is not a reading, it is the floor the readings are measured against, and it is the
 * only absolute reference the plot has.
 *
 * Nothing names a single date until you ask. At rest the header names the year the record began and
 * no figure is printed at all; a bucket's date and degrees appear under your finger, in that same
 * corner, and leave with it, because a date printed on the axis is a label you read once and then
 * have to keep ignoring. Nor does any sentence say what the line already shows: whether it rises
 * is for the line to say.
 */
export function LifetimeCard({ series }: { series: RecordSeries }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // Per instance, so stacked charts cannot share one gradient id and paint each other's fill.
  const areaFillId = `overTimeArea-${useId()}`;

  const points = series.points;
  const count = points.length;

  // Closed buckets carry the settled curve; the one still running carries the dash.
  //
  // **A bucket's own rate is the value — there is no second, smoothed series.** The curve used to be
  // drawn through a trailing mean while the scrub dot and the readout used the raw rate, so the two
  // disagreed by construction: the dot landed off the line and reported a number the line was not
  // showing. Legibility is the cubic's job, and the bucket width already averages as the record
  // grows, so the smoothing bought a mismatch and nothing else. One array, one meaning: what you
  // scrub is what is drawn is what is said.
  const closed = useMemo(() => points.map((p, i) => ({ p, i })).filter((x) => x.p.possible > 0 && !x.p.pending), [points]);

  const total = count;

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
  // The dashed run: on from the settled curve to the span still open, starting at the last settled
  // point so the two read as one stroke.
  const unsettled: Pt[] = nowPoint && settled.length > 0 ? [settled[settled.length - 1]!, nowPoint] : [];

  // The plot's one absolute reference. Without it a curve sitting at mid-height says only "some
  // middling amount" — the line has no axis, no gridline and no ceiling, so height alone means
  // nothing you can name. Averaged over the buckets drawn, so the rule describes the line it sits on.
  const average = useMemo(() => mean(closed.map((x) => x.p.rate)), [closed]);
  const averageY = width > 0 && average !== null ? pointAt(0, average, width, BOX).y : null;
  // Under what it averages and nowhere else.
  const averageStartX = settled[0]?.x ?? BOX.padX;
  const averageEndX = settled.length > 0 ? settled[settled.length - 1]!.x : 0;

  // Where the rule's label sits. Its plate is opaque — it has to be, to stay legible over the area
  // fill — so wherever it lands it ERASES what is drawn there, and placing it has to answer two
  // questions rather than one.
  //
  // It used to answer only "which side of the rule does the curve start on?" and take the other.
  // That is right while the rule sits in open plot and wrong the moment it nears the floor: an
  // average low enough to put it there leaves no room beneath, so the label dropped past the
  // chart's own height and its plate punched a hole through the baseline AND through the curve
  // running along it. A record with one strong day and the rest empty came out looking like a line
  // with a piece missing — which is what it was, though nothing was wrong with the line.
  //
  // So: below the rule only when the curve is up there AND the label clears the baseline whole.
  // Otherwise above, where a low average leaves the whole plot empty anyway.
  //
  // The plate still lands on the curve sometimes, and that stays deliberate — it is what keeps the
  // reference readable where a line crosses it, and a slanted stroke behind a rounded chip reads as
  // occlusion. What it must never sit on is something STRAIGHT: a gap in the baseline, or in the
  // long flat run of a curve along it, is the one overlap the eye reads as breakage rather than as
  // depth.
  //
  // And it is no longer pinned to the rule's START. A record that opens high and settles low puts
  // its first point exactly where the label would go, with no room beneath the rule to move to —
  // so the plate sat on the very beginning of the line, which reads as a line with its start torn
  // off. The rule has two ends; the label takes the first spot the curve does not pass through,
  // trying the start first so nothing moves on a chart that was already fine. Only when every spot
  // is crossed does it fall back to the start and accept the overlap.
  const averageLabel = (() => {
    if (averageY === null) return null;
    const above = Math.max(0, averageY - AVERAGE_LABEL_GAP - AVERAGE_LABEL_HEIGHT);
    const below = averageY + AVERAGE_LABEL_GAP;
    const belowFits = below + AVERAGE_LABEL_HEIGHT <= BASELINE_Y;
    const startTop = settled[0] && settled[0].y < averageY && belowFits ? below : above;
    const startLeft = averageStartX + AVERAGE_LABEL_INSET;
    const endLeft = averageEndX - AVERAGE_LABEL_INSET - AVERAGE_LABEL_WIDTH;
    const spots = [
      { atEnd: false, top: startTop },
      ...(belowFits || startTop !== above ? [{ atEnd: false, top: startTop === above ? below : above }] : []),
      // The end is a second place only when the rule is long enough for it to be a different one.
      ...(endLeft >= startLeft + AVERAGE_LABEL_WIDTH
        ? [{ atEnd: true, top: above }, ...(belowFits ? [{ atEnd: true, top: below }] : [])]
        : []),
    ];
    const clear = spots.find(({ atEnd, top }) => {
      const left = atEnd ? endLeft : startLeft;
      // Grown by the stroke, so a line brushing the plate's edge counts as touching it.
      return !lineCrossesRect(settled, {
        left: left - 2,
        right: left + AVERAGE_LABEL_WIDTH + 2,
        top: top - 2,
        bottom: top + AVERAGE_LABEL_HEIGHT + 2,
      });
    });
    return clear ?? spots[0]!;
  })();

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
  //
  // A parked reading belongs to the span it was taken on, so it is stored WITH that span and
  // *derived* rather than reset. Two inputs shift beneath a parked index: a refetch that changes the
  // bucket count, and a rotation that changes `width`. Both are exactly the inputs `slotX` places
  // the mark from, so a reading taken before either would point at a different bucket, or none at
  // all past the new end. (Derived, not reset, for the reason the day's fold state is: an effect
  // chasing the change would be a cascading render, and would miss any path that changes the span
  // silently.)
  const span = `${total}|${width}`;
  const spanRef = useLatestRef(span);
  const [focus, setFocus] = useState<{ span: string; index: number } | null>(null);
  const focused = focus?.span === span ? focus.index : null;
  // Stable, and takes a primitive — `moveTo` is a worklet, and only primitives cross that line.
  const setFocused = useCallback(
    (index: number | null) => setFocus(index === null ? null : { span: spanRef.current, index }),
    [spanRef],
  );
  const cursorX = useSharedValue(0);
  const cursorOn = useSharedValue(0);
  const lastIndex = useSharedValue(-1);

  // One beat per bucket crossed.
  const tickAt = () => haptics.selection();
  const moveTo = (x: number) => {
    'worklet';
    const w = widthSV.get();
    if (w <= 0 || count === 0) return;
    const i = slotAtX(x, total, w, BOX);
    // The cursor is placed by the same function that places the curve's points, so the two cannot
    // drift apart — the hairline lands exactly on the slot whose reading is being shown.
    cursorX.set(slotX(i, total, w, BOX));
    cursorOn.set(1);
    if (lastIndex.get() === i) return; // ratchet: one beat per bucket crossed, never per frame
    lastIndex.set(i);
    scheduleOnRN(setFocused, i);
    scheduleOnRN(tickAt);
  };
  const release = () => {
    'worklet';
    cursorOn.set(withTiming(0, { duration: Duration.base }));
    lastIndex.set(-1); // so the next scrub re-ticks even on the same bucket
    // The reading goes back to the resting one: a date is what you asked for, not a place the card
    // is left parked.
    scheduleOnRN(setFocused, null);
  };
  /** The same return-to-rest, from the JS thread — the assistive path's equivalent of a lifted
   *  finger. Both clear the mark AND the reading together; a cursor left standing over a reading
   *  that has gone back to resting is the exact mark/words disagreement this card must not have. */
  const rest = () => {
    setFocused(null);
    cursorOn.set(0);
    lastIndex.set(-1);
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

  // The reading above derives itself; the MARK cannot — `cursorX`/`cursorOn` are shared values, and
  // a hairline left standing at an x computed from the old span is the mark/words disagreement this
  // card exists to avoid. Taking it down is a write to the UI thread, not a setState, so it is the
  // one thing here that an effect is genuinely for.
  useEffect(() => {
    cursorOn.set(0);
    lastIndex.set(-1);
  }, [span, cursorOn, lastIndex]);

  const cursorProps = useAnimatedProps(() => ({ x1: cursorX.get(), x2: cursorX.get(), opacity: cursorOn.get() }));
  const focusProps = useAnimatedProps(() => ({ opacity: cursorOn.get() }));

  // ── The reading ──────────────────────────────────────────────────────────────────────────────
  const focusedPoint = focused != null ? (points[focused] ?? null) : null;
  /**
   * One bucket, read: which span it is, and its figure.
   *
   * A span that asked nothing has no reading. "0°" would be a score for something that was never
   * yours to keep — the same reason the curve leaves its slot empty rather than dropping to the
   * floor, said in words.
   *
   * The span is always NAMED beside the figure, and that is load-bearing: a bucket is its own span's
   * rate, and the span widens with the record, a day while it is young and several once it is not.
   * The label says which.
   */
  const readingFor = (p: SeriesPoint) => ({
    label: bucketLabel(p),
    value: p.possible === 0 ? null : formatDegrees(p.rate),
  });
  const spoken = ({ label, value }: ReturnType<typeof readingFor>) => `${label} · ${value ?? 'nothing due'}`;

  // The figures wait for a touch. At rest the header says which span the card covers and the plot
  // says the rest: the height of the line, and the average rule's own label. A resting reading
  // ("Today · 212°") under the header repeated what the hollow dot and the rule already show, so it
  // went; under a finger the header's caption BECOMES the reading, in the same corner, so the
  // answer to "where am I" is always in one place and nothing below it moves while you scrub.
  const covers = spanLabel(series);
  const focusedReading = focusedPoint ? readingFor(focusedPoint) : null;
  // What a screen reader hears as the plot's value: the bucket under the cursor, else the newest
  // one, since the curve's height is no use to it.
  const latest = points[count - 1];
  const a11yValue = focusedReading ? spoken(focusedReading) : latest ? spoken(readingFor(latest)) : '';

  // "of N days each" only where the buckets are wider than a day.
  const grain = series.bucketDays > 1 ? ` of ${series.bucketDays} days each` : '';
  // What the plot IS — never what it currently reads. An `adjustable` announces its NAME and then
  // its VALUE, and the value is `a11yValue`: naming the reading here too made every announcement
  // say it twice in a row ("Easing · 26°, Easing · 26°"). One fact, said once, in the one place
  // that owns it.
  const a11y = [
    `Your whole record, ${count} points${grain}.`,
    average !== null ? `Averaging ${formatDegrees(average)}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  // The non-visual twin of the scrub — the `adjustable` role's increment/decrement.
  //
  // It drives the CURSOR as well as the reading. It used to set `focused` alone, and the cursor
  // hairline and focus dot both take their opacity from `cursorOn`, which only a finger ever set:
  // so stepping through the record announced a new date and a new figure while the plot sat
  // perfectly still. The mark now lands where the reading is, and stays there — an adjustable
  // control's current value is a place you are standing, not a place you are touching.
  //
  // From rest the reading already points at the last bucket, so the first press in EITHER
  // direction lands on it rather than stepping off. (It used to start at `count - 1` and add, so
  // the very first increment fell out of range and did nothing at all.)
  const step = (by: number) => {
    // Stepping DOWN off the first bucket is how you put the chart back to rest — the header goes
    // back to naming the span. A finger gets that for free when it lifts; without this an
    // assistive user who stepped once could never get the resting card back.
    if (focused === 0 && by < 0) {
      haptics.selection();
      rest();
      return;
    }
    const next = focused === null ? count - 1 : focused + by;
    if (next < 0 || next > count - 1) return;
    tickAt();
    setFocused(next);
    if (width > 0) {
      cursorX.set(slotX(next, total, width, BOX));
      cursorOn.set(1);
    }
  };

  if (count === 0) return null;

  return (
    <StatCard>
      {/* The caption says where the record begins. Under a finger it is the reading instead: the
          date in the caption's own quiet ink, the figure in the primary one, because it is the
          datum. */}
      <StatCardHeader
        title="Lifetime"
        trailing={
          focusedReading ? (
            <View style={styles.caption}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.captionLabel}>
                {focusedReading.label}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {' · '}
                {focusedReading.value ? (
                  <ThemedText type="smallBold" style={styles.captionValue}>
                    {focusedReading.value}
                  </ThemedText>
                ) : (
                  'nothing due'
                )}
              </ThemedText>
            </View>
          ) : (
            covers
          )
        }
      />

      <GestureDetector gesture={gesture}>
        <View style={styles.chart} onLayout={onLayout} accessible accessibilityRole="adjustable"
          accessibilityLabel={a11y}
          accessibilityValue={{ text: a11yValue }}
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

              {settledPaths.area ? <Path d={settledPaths.area} fill={`url(#${areaFillId})`} /> : null}

              {/* The average of what is drawn — solid, and in a track tone, because it is furniture
                  rather than a reading. A DASHED rule would read as unsettled: this chart spends
                  its dashes on "not settled yet" and can't spend them twice. It spans the settled
                  points and no further, because those are what it describes. */}
              {averageY !== null ? (
                <Line
                  x1={averageStartX}
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
                <AnimatedPath
                  d={unsettledPath}
                  stroke={theme.accent}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="2 5"
                  fill="none"
                  animatedProps={unsettledProps}
                />
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
                  strokeWidth={CURRENT_STROKE}
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
              type and colour roles. It sits at one end of the rule, on whichever side the curve
              leaves free.
              It also carries the card's own background as a plate, for the record where no spot
              is free: a busy lifetime line can cross every one. A label you have to read through a
              stroke is not a label; the plate costs a few pixels of the area fill and makes the
              reference legible whatever shape the curve turns out to be. */}
          {averageLabel !== null ? (
            <ThemedText
              type="smallCompact"
              themeColor="textSecondary"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.averageLabel,
                { backgroundColor: theme.backgroundElement },
                { top: averageLabel.top },
                averageLabel.atEnd
                  ? { right: width - averageEndX + AVERAGE_LABEL_INSET }
                  : { left: averageStartX + AVERAGE_LABEL_INSET },
              ]}
              pointerEvents="none">
              Avg {formatDegrees(average)}
            </ThemedText>
          ) : null}

          {/* Nothing to draw yet — name the empty space rather than present a bare floor, which
              reads as a chart that failed. */}
          {closed.length === 0 ? (
            <View style={styles.empty} pointerEvents="none">
              <ThemedText type="small" themeColor="textSecondary">
                Nothing to plot until tomorrow.
              </ThemedText>
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </StatCard>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const styles = StyleSheet.create({
  // The scrubbed reading. The date gives way first: a lifetime bucket across a month boundary
  // ("26 Jumādā al-Awwal – 2 Jumādā al-Thānī") is wider than the caption's share of the row, and
  // the figure is the thing you were scrubbing for.
  caption: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  captionLabel: { flexShrink: 1 },
  // Tabular, so the date beside it does not shuffle sideways as the digits change under a finger.
  captionValue: { fontVariant: ['tabular-nums'] },
  chart: { width: '100%', height: BOX.height },
  averageLabel: {
    position: 'absolute',
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.control,
    overflow: 'hidden', // Android clips a Text's background to its radius only when told to
  },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
