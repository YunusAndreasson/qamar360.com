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
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Duration, PageEnter } from '@/constants/motion';
import { Radius, Spacing } from '@/constants/theme';
import { useLatestRef } from '@/hooks/use-latest-ref';
import type { RecordSeries, SeriesPeriod, SeriesPoint, TrendSummary } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { buildSmoothPaths, mean, pointAt, polylineLength, project, slotAtX, slotX, spanFor, type PlotBox, type Pt } from '@/lib/chart';
import { hijriParts } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { formatPercent } from '@/lib/progress-format';

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

/** How far back the projection is fitted — recent shape only, so an old rhythm can't anchor it. */
const FIT_WINDOW = 14;
/** The furthest ahead the line ever looks, in buckets. */
const MAX_HORIZON = 6;

/** A bucket as a reading. One day says its date; a wider span says the day it ends on, which is the
 *  most recent thing in it and so the one you were looking for. */
function bucketLabel({ iso, endISO, pending }: SeriesPoint, period: SeriesPeriod): string {
  // A pending bucket is named for the span it MEASURES, not for the day you happen to read it on.
  // Week and month bucket by the day, so "Today" is exactly right; a year buckets by the Hijri
  // month. A lifetime buckets by however many days it takes to fit the whole record on one line
  // (`lifeBucketDays`), so its last bucket is usually several days wide — and calling that "Today"
  // hung a one-day label on a multi-day number, on the one card whose reading nothing else on the
  // screen repeats. Anything wider than a day falls through and names its own range instead.
  if (pending) {
    if (period === 'year') return 'This month';
    if (iso === endISO) return 'Today';
  }
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

/** How each period names its card. Narrowest first — the order they are shown in. */
const PERIOD_LABEL: Record<SeriesPeriod, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
  life: 'Lifetime',
};

/**
 * The record over time — one card per period, narrowest first.
 *
 * The screen's second instrument, and the only one that moves on a second day of use: the hero
 * measures the month you are in, these measure whether you are becoming someone who keeps it.
 *
 * **A period names a span, and its resolution follows from it** — a week is seven days, a month is
 * its own days, a year is its twelve months, a lifetime is bucketed only as far as it must be to
 * fit. So a card says what it covers and no card can land on a line too dense to read. A period
 * gets a card only once the record can fill it with something a wider one doesn't already say, so
 * a new account sees one card and gains the others as its history earns them. (That rule was
 * written for a selector, and it carries over unchanged: what was "don't offer a setting that
 * draws the same line" is now "don't stack a card that draws the same line".)
 *
 * Every card is the same component. Nothing about a week's line differs from a lifetime's except
 * the buckets underneath it, so the chart is written once and given a series — which is also what
 * keeps four scrubbers, four projections and four averages honest with one another.
 *
 * The line's grammar is one rule: **solid is settled, dashed is not.** A solid curve runs through
 * what is closed; a dashed one carries on through the span still being lived and out to where the
 * fitted slope is heading, ending in a caret. The future is drawn in the same ink as the present
 * and marked as provisional — direction without a promise. The average is the one exception drawn
 * flat and solid in a track tone: it is not a reading, it is the floor the readings are measured
 * against, and it is the only absolute reference the plot has.
 *
 * Nothing names a date until you ask — except the one you are standing on. At rest the line reads
 * the newest bucket; the rest of the calendar appears under your finger and leaves with it, because
 * a date printed on the axis is a label you read once and then have to keep ignoring.
 *
 * Which WAY you are going is the plot's job, not the line's: the dashed run ends in an arrowhead,
 * and a word repeating it is a caption on a picture that was already clear.
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
  return (
    <>
      {periods.map((period, i) => (
        <PeriodCard
          key={period}
          series={seriesByPeriod[period]}
          // The rising-months sentence is a claim about the whole record, so it belongs to the
          // widest card on screen and to no other. Handed to every card it would print four times
          // down the page, which turns the screen's one multi-month statement into wallpaper.
          trend={i === periods.length - 1 ? trend : null}
        />
      ))}
    </>
  );
}

/** One period's card: its span, its reading, and its line. */
function PeriodCard({ series, trend }: { series: RecordSeries; trend: TrendSummary | null }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // Per instance, so four stacked charts cannot share one gradient id and paint each other's fill.
  const areaFillId = `overTimeArea-${useId()}`;

  const period = series.period;
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
  const averageLabelTop =
    averageY === null
      ? null
      : settled[0] && settled[0].y < averageY && averageY + AVERAGE_LABEL_GAP + AVERAGE_LABEL_HEIGHT <= BASELINE_Y
        ? averageY + AVERAGE_LABEL_GAP
        : Math.max(0, averageY - AVERAGE_LABEL_GAP - AVERAGE_LABEL_HEIGHT);

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
  // *derived* rather than reset. A card's period no longer changes under it — each period has its
  // own instance now — but the other two inputs still shift beneath a parked index: a refetch that
  // changes the bucket count, and a rotation that changes `width`. Both are exactly the inputs
  // `slotX` places the mark from, so a reading taken before either would point at a different
  // bucket, or none at all past the new end. `period` stays in the key because it costs nothing
  // and it is what makes the key describe the whole coordinate system rather than most of it.
  // (Derived, not reset, for the reason the day's fold state is: an effect chasing the change
  // would be a cascading render, and would miss any path that changes the span silently.)
  const span = `${period}|${total}|${width}`;
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
   * One bucket, read aloud — the card's ONE grammar for a reading, at rest and under a finger
   * alike, so scrubbing is visibly the same line moving back in time rather than a different kind
   * of sentence appearing.
   *
   * A span that asked nothing has no reading. "0°" would be a score for something that was never
   * yours to keep — the same reason the curve leaves its slot empty rather than dropping to the
   * floor, said in words.
   *
   * The span is always NAMED beside the figure, and that is load-bearing: a degree here is not the
   * degree on the hero. The hero's is a position on the month's orbit, where 360° is the month
   * kept. A bucket's is that bucket's own rate — and the bucket rescales with the selector, so a
   * full orbit is one perfect day on Week and Month, one perfect Hijri month on Year, one perfect
   * span-of-N-days on Lifetime. Nothing else on screen says which. The label does.
   *
   * A bucket still running used to add " so far". It was a hedge, not a fact: every reading on this
   * card is "so far" — a closed one is what a span came to, an open one is what it has come to —
   * and the card already says which, twice, in the medium that can say it (the curve turns to a
   * dash at the open bucket, and the dot on it is hollow). Four cards ending in the same three
   * words down one screen read as an apology for the number above them.
   */
  const readingFor = (p: SeriesPoint) =>
    p.possible === 0
      ? `${bucketLabel(p, period)} · nothing due`
      : `${bucketLabel(p, period)} · ${formatPercent(p.rate)}`;

  // At rest the line reads the newest bucket — where you are now, which is what you came for.
  //
  // It used to read the fitted slope's one-word direction ("Steady", "Easing"). That word was a
  // caption for something the plot already draws: the dashed run continues the curve and ends in an
  // ARROWHEAD, which is the direction, stated in the medium that can state it. And a lone adjective
  // with no subject is a poor caption anyway — "Steady" says nothing about what is steady, or since
  // when, or at what level. The one direction that survives is the multi-month sentence below,
  // which no arrowhead can draw: it names the month the run began in. (The word is not lost for
  // everyone — see the accessibility label, where an arrowhead is no use.)
  // The newest bucket, or nothing at all. This read `points[count - 1]!` under a comment claiming
  // "`count === 0` returned null long before here" — it does not: that guard is ~50 lines BELOW,
  // and it has to be, because every hook in this component runs between here and there. So an
  // empty series reached `readingFor(undefined)`, which dereferences `p.possible` on the first
  // line, and took the whole Progress tab down.
  //
  // Not hypothetical: `seriesPeriods` returns `life` unconditionally ("the record itself is always
  // readable"), and `computeProgress` hands back four EMPTY series whenever `live` is false — which
  // includes a record whose only habits are optimistic rows with no `created_at` yet, and a device
  // clock far enough ahead that `opened > today`. `habitsCount` is non-zero in both cases, so the
  // screen's empty state does not fire and this card renders.
  //
  // A missing reading is already a state everything downstream handles (the readout renders only
  // `readoutText ?` and the a11y value falls back to `''`), so the fix is to say there isn't one
  // rather than to invent a guard the hook order can't support.
  const latest = points[count - 1];
  const restingText =
    trend && trend.risingMonths >= 3 && trend.sinceMonthName
      ? `Rising since ${trend.sinceMonthName}`
      : latest
        ? readingFor(latest)
        : null;
  const readoutText = focusedPoint ? readingFor(focusedPoint) : restingText;

  // "of N days each" only where the buckets have a width to name — a year's are calendar months.
  const grain = period === 'year' ? ' of one Hijri month each' : series.bucketDays > 1 ? ` of ${series.bucketDays} days each` : '';
  // What the plot IS — never what it currently reads. An `adjustable` announces its NAME and then
  // its VALUE, and the value is `readoutText`, which at rest is `restingText`: naming the reading
  // here too made every announcement say it twice in a row ("Easing · 26°, Easing · 26°"). The
  // same rule the card follows on screen — one fact, said once, in the one place that owns it.
  const a11y = [
    `Your record over the ${PERIOD_LABEL[period].toLowerCase()}, ${count} points${grain}.`,
    average !== null ? `Averaging ${formatPercent(average)}.` : null,
    // The shape of the thing, for whoever cannot see its shape. This is where the direction word
    // went when it came off the card: sighted readers get it from the arrowhead on the dashed run,
    // and an arrowhead is no use here. It belongs to the plot's DESCRIPTION, never to its value.
    projection ? `Trending ${projection.direction.toLowerCase()}.` : null,
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
    // Stepping DOWN off the first bucket is how you put the chart back to rest — the readout
    // returns to what the card says when nobody is touching it ("Rising since Rajab", the
    // screen's one multi-month sentence). A finger gets that for free when it lifts; without
    // this an assistive user who stepped once could never see the resting reading again.
    if (focused === 0 && by < 0) {
      haptics.selection();
      rest();
      return;
    }
    const next = focused === null ? count - 1 : focused + by;
    if (next < 0 || next > count - 1) return;
    haptics.selection();
    setFocused(next);
    if (width > 0) {
      cursorX.set(slotX(next, total, width, BOX));
      cursorOn.set(1);
    }
  };

  if (count === 0) return null;

  return (
    <StatCard>
      {/* The period names the card, and nothing else does — the same four words the selector used
          to carry, now sitting where a card says what it is.

          Two of the four used to carry a trailing span caption as well ("from 6 Rabīʿ al-Awwal",
          "since Dhū al-Qaʿdah 1447") while Month and Year carried none, so four cards of one kind
          wore two different headers down one screen — and the reason the other two went without
          (the hero above them is already captioned with the month) stays out of the chart. The
          dates are not lost: this card's own rule is that nothing names a date until you ask, and
          the reading below already names the bucket you are standing on. */}
      <StatCardHeader title={PERIOD_LABEL[period]} />

      {/* The reading and the plot are ONE unit, and the layout now says so: the readout is the
          chart's caption, it changes with the finger scrubbing the chart, and nothing may come
          between them. Grouped, so they carry the tight inner gap while the card's own rhythm
          spaces the group from the control above. */}
      <View style={styles.reading}>
        {readoutText ? (
          <StatReadout text={readoutText} refreshKey={`${period}:${focused ?? 'resting'}`} />
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
                type and colour roles. It sits at the left edge, clear of the forecast, and flips to
                whichever side of the rule the curve is NOT on where it opens.
                It also carries the card's own background as a plate. The flip only knows where the
                curve STARTS — a lifetime line that climbs steeply a few points in walks straight
                through the text either way, and on this record it did. A label you have to read
                through a stroke is not a label; the plate costs a few pixels of the area fill and
                makes the reference legible whatever shape the curve turns out to be. */}
            {averageLabelTop !== null ? (
              <ThemedText
                type="smallCompact"
                themeColor="textSecondary"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.averageLabel,
                  { backgroundColor: theme.backgroundElement },
                  { top: averageLabelTop },
                ]}
                pointerEvents="none">
                Avg {formatPercent(average)}
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
      </View>
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
  // The readout is the chart's caption, so it rides a tighter gap than the card's own rhythm —
  // near enough to belong to the plot beneath it, not to the control above.
  reading: { gap: Spacing.two },
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
