/**
 * Progress math, shared by every chart. Completion in this app is shown around a lunar orbit,
 * so a rate (0–1) is expressed in orbit *degrees*, never percent — see the Progress screen.
 * Kept here so the moon ring, the month grid and the year strip compute it identically.
 *
 * `computeProgress` lives here (not in the hook) so it stays a pure function with no React or
 * Supabase imports — directly unit-testable.
 */

import type { Tables } from '@/lib/database.types';
import {
  addDaysISO,
  createdDayISO,
  daysBetweenISO,
  hijriMonthRange,
  hijriParts,
  hijriYearRange,
  scheduledOn,
  type HijriSchedule,
} from '@/lib/dates';

/** A full orbit — 100% completion. */
const FULL_CIRCLE_DEGREES = 360;

/** Clamp a value into the 0–1 completion range. */
export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** A completion rate (0–1) as whole orbit degrees — the app's unit for progress. */
export function toDegrees(rate: number): number {
  return Math.round(clamp01(rate) * FULL_CIRCLE_DEGREES);
}

/**
 * The geometry of a progress ring of pixel `size` drawn with `strokeWidth`, filled to `fraction`
 * (0–1). Shared by the checklist's completion ring and the Progress moon rings so both lay out the
 * arc identically. `arc` / `circumference` feed an SVG `strokeDasharray`.
 */
export function ringMetrics(size: number, strokeWidth: number, fraction: number) {
  const clamped = clamp01(fraction);
  const radius = size / 2;
  const ringRadius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  return { clamped, isComplete: clamped >= 1, radius, ringRadius, circumference, arc: circumference * clamped };
}

/**
 * Whether a stack is sealed — every act it has due today is done. Skipped members are excused,
 * out of the stack's "open" set, the same way {@link computeProgress} and the day-complete rule
 * drop an excused act.
 *
 * A stack with a single act due still seals: the stack is the unit the app tracks, so sealing one
 * *is* the milestone, however short its sequence happens to be today (a five-act stack with four
 * acts excused is not a lesser event than the same stack in full).
 *
 * The single source of truth for "stack complete" — the card's border flash and the synced
 * completion haptic both read it, so the flash and the buzz can never disagree.
 */
export function isStackComplete(members: { id: string }[], completed: Set<string>, skipped: Set<string>): boolean {
  const open = members.filter((m) => !skipped.has(m.id));
  if (open.length === 0) return false;
  return open.every((m) => completed.has(m.id));
}

/** The minimal habit shape {@link sealableActs} needs — `Habit` satisfies it structurally. */
export type StackMember = {
  id: string;
  stack_id: string | null;
  created_at: string | null;
  schedule_days: number[];
  hijri_schedule?: HijriSchedule | null;
};

/**
 * The acts a seal acts on: everything `stackId` has due on `day`, minus the excused and anything
 * not yet persisted (a `temp-` row's insert is still in flight and has no id to write against).
 *
 * Seal and unseal both resolve membership through this, so the pair can never disagree about
 * what the day's sequence was — and it is the same "open acts" notion {@link isStackComplete}
 * checks, so the card's sealed look and the write always describe the same set.
 */
export function sealableActs<T extends StackMember>(
  habits: readonly T[],
  skipped: Set<string>,
  stackId: string,
  day: string,
): T[] {
  return habits.filter(
    (h) => h.stack_id === stackId && !h.id.startsWith('temp-') && scheduledOn(h, day) && !skipped.has(h.id),
  );
}

/**
 * How many things the day still asks of you — the number on the tab and the app icon.
 *
 * Counted in **units, not acts**: the stack is what the app tracks and seals, so a five-act Fajr
 * stack is one thing to do, not five. (The badge counted acts from before the stacks-only rewrite,
 * which put a "5" on the tab for a single morning.) An exchange is its own unit because it is
 * ticked on its own, and a legacy stackless act counts for itself because nothing else will count
 * it.
 *
 * A stack whose due acts are all excused is not outstanding, and neither is a sealed one — the
 * same "open acts" notion {@link sealableActs} resolves, so the badge and the seal can't disagree.
 * Tasks are added by the caller (they live in another table entirely).
 */
export function openUnitsOn(
  habits: readonly StackMember[],
  completed: Set<string>,
  skipped: Set<string>,
  day: string,
  hijriOffset?: number,
): number {
  // stack id → does it still have an act to do; standalone rows count themselves as they're seen.
  const stackOpen = new Map<string, boolean>();
  let loose = 0;
  for (const h of habits) {
    if (h.id.startsWith('temp-')) continue; // not persisted — nothing to seal yet
    if (!scheduledOn(h, day, hijriOffset) || skipped.has(h.id)) continue;
    const open = !completed.has(h.id);
    if (h.stack_id) stackOpen.set(h.stack_id, (stackOpen.get(h.stack_id) ?? false) || open);
    else if (open) loose += 1; // an exchange, or a legacy unanchored act: one unit each
  }
  let units = loose;
  for (const open of stackOpen.values()) if (open) units += 1;
  return units;
}

/** The minimal habit shape {@link computeProgress} needs — `Habit` satisfies it structurally. */
export type ProgressHabit = {
  id: string;
  created_at: string | null;
  schedule_days: number[];
  hijri_schedule?: HijriSchedule | null;
  /** A count-goal target (e.g. 5 pages); a scheduled day earns `count ÷ target` credit. Null = binary. */
  target_count?: number | null;
  /**
   * Optional, because none of the arithmetic here needs one — a rate is a rate whatever the act
   * is called. The goals do (they name the acts that feed them), and they run off this same
   * habit shape, so it rides along rather than forcing a second one.
   */
  name?: string | null;
};

/** The completion-row fields the progress math reads. */
export type CompletionRow = Pick<Tables<'habit_completions'>, 'habit_id' | 'completed_at' | 'status' | 'count'>;

/**
 * This Hijri month: its date (for the moon hero's lunar phase), its completion so far (the
 * overall %), and its day-by-day shape (the bars). `null` when the platform's `Intl` lacks
 * the Islamic calendar.
 */
export type MonthProgress = {
  /** Hijri month name, e.g. "Muharram". */
  monthName: string;
  /** Hijri year, e.g. 1448. */
  year: number;
  /** Today's day of the Hijri month, 1-based. */
  dayOfMonth: number;
  /** Days in this Hijri month (29 or 30). */
  monthLength: number;
  /**
   * Whole-month completion so far, 0–1: acts done month-to-date ÷ acts scheduled across the
   * FULL month. The single source of truth for the orbit/degrees — so a perfect day reads as a
   * small slice, and rate 1 (360°) means the whole month is actually complete.
   */
  thisRate: number;
  /**
   * Where the MONTH itself has got to, 0–1: acts that have come *due* month-to-date ÷ acts
   * scheduled across the whole month. Same denominator as {@link thisRate}, so the two are
   * directly comparable positions on one orbit — and `thisRate <= paceRate` always holds (an act
   * cannot be completed before it comes due), which is what makes the gap between the two arcs
   * read as "what's outstanding".
   *
   * Deliberately elapsed *schedule*, not elapsed days (`dayOfMonth / monthLength`): habits are not
   * uniformly scheduled — White Days, Mondays/Thursdays — so a day count would misstate how much
   * of the month has actually been asked of you.
   *
   * Unlike {@link averageRate} this exists from the first day of the first month: it is the
   * calendar, not a past self, so a new user always has a mark to catch.
   */
  paceRate: number;
  /**
   * Your usual by this same Hijri day, on the same whole-month scale (0–1): for each prior Hijri
   * month on record, the acts done through the matching day ÷ that month's full possible,
   * averaged over them. Directly comparable to {@link thisRate}, so the caret outside the rim
   * marks a position the bright arc can be read against.
   *
   * This is what the ring's caret shows. It used to show {@link previousRate} — one sample, so a
   * single bad month or lucky one moved the benchmark by its whole width. The average is the same
   * reading with the noise out of it, and it costs no new mark and no new tone on a ring that
   * cannot afford either.
   */
  averageRate: number;
  /** How many prior months went into {@link averageRate}. 0 → the first month; hide the caret. */
  monthsAveraged: number;
  /**
   * Last month alone by this same Hijri day, same scale (0–1). Kept separate from
   * {@link averageRate} because the two are read by different consumers and mean different
   * things: the ring wants your usual, while the day-complete celebration and the lunar update
   * both say "last month" in so many words, and an average would make that copy a lie.
   */
  previousRate: number;
  /** Whether last month was tracked at all (false → the user's first month). */
  hasPrevious: boolean;
};



/**
 * The most points the record is ever drawn with. Past this the line stops being a shape and starts
 * being a texture, and a phone has nowhere to put them.
 */
export const SERIES_MAX_POINTS = 80;

/**
 * How far back the two month-by-month walks look — the ring's average-by-this-day and the
 * rising-months trend. A Hijri year is the app's natural window, and both walks stop early at the
 * first month that was never tracked, so this is a ceiling rather than a cost.
 */
const MONTHS_BACK = 12;

/** One bucket of the record — a day while the record is short, a wider span once it isn't. */
export type SeriesPoint = {
  /** First day of the bucket, `YYYY-MM-DD`. */
  iso: string;
  /** Last day of the bucket, inclusive. Equals {@link iso} while buckets are single days. */
  endISO: string;
  /** The bucket's completion, 0–1: credit earned ÷ acts scheduled in it (excused ones dropped). */
  rate: number;
  /**
   * Acts scheduled in the bucket, after excusals. `0` means it carries no signal — nothing was due
   * — and its x-slot is left EMPTY rather than drawn as a 0° miss on the floor (the rule
   * {@link import('./habit-stats').computeHabitStats}'s trend already uses at week scale).
   */
  possible: number;
  /** The bucket containing today: still being lived, so drawn provisionally and left out of any fit. */
  pending: boolean;
};

/**
 * A period the record can be read over. Narrowest first — the order the selector offers them in.
 *
 * **A period names a span, and its resolution follows from it.** Choosing "Year" and choosing
 * "one point per month" are the same choice, so there is only ever one control and no way to
 * land on a combination that cannot be drawn: a week is seven days, a month is its own days, a
 * year is its twelve months, and a lifetime is bucketed only as far as it must be to fit.
 *
 * This is the arrangement a Days / Months / Years switch got wrong. That control set the *grain*
 * while the span stayed fixed, which is why two of its three settings were empty for anyone new
 * and why it made you do by hand what the record can say for itself.
 */
export type SeriesPeriod = 'week' | 'month' | 'year' | 'life';

/**
 * The record read over one period — the line the Progress chart draws.
 *
 * A bucket is measured against its own schedule, exactly like every other figure on the screen,
 * so a point can never disagree with the month that contains it.
 */
export type RecordSeries = {
  /** Oldest first, ending with the bucket that contains today. Empty before anything was scheduled. */
  points: SeriesPoint[];
  /**
   * Days per bucket, where the buckets have a fixed width: 1 when the line is drawn day by day,
   * and for `life` a width that grows continuously with the length of the record (2 at five
   * months, 10 after two years) so it thins by degrees rather than lurching at a threshold.
   * **`0` means the buckets are calendar months** and have no single width — read {@link period}.
   */
  bucketDays: number;
  /** The first day this line is drawn from. For `life` that is also where the record opens,
   *  because there the window IS the record. `null` when nothing was ever scheduled. */
  sinceISO: string | null;
  /** The period this line was read over, so a card can name itself from the series alone. */
  period: SeriesPeriod;
};



/**
 * The improvement trend, read off COMPLETE Hijri months only: how many consecutive closed
 * months (ending with the most recent one) rose strictly, whole-month rate over whole-month
 * rate. The current, in-progress month is excluded — its month-to-date rate measured against
 * closed months would read as a dip at every month's start. One increase is noise, not a
 * direction, so `risingMonths` is 0 or ≥ 3. There is deliberately no falling counterpart —
 * silence, not shame (the same negative space as {@link import('./celebration').celebrationCopy}).
 */
export type TrendSummary = {
  /** Consecutive complete Hijri months whose rates strictly rise; 0 (no trend) or ≥ 3. */
  risingMonths: number;
  /** Name of the Hijri month the ascent began (the run's first month), or null without a run. */
  sinceMonthName: string | null;
};

/** Everything the Progress screen derives from the raw rows. */
export type ProgressDerived = {
  habitsCount: number;
  /** This Hijri month's completion so far — the moon ring, or `null` if unavailable. */
  month: MonthProgress | null;
  /** The rising-months statement ("Rising since …"), or `null` if the calendar is unavailable. */
  trend: TrendSummary | null;
  /**
   * The record read over each period. `life` is the whole of it — it moves on a user's second day,
   * still reads after five years, and needs no calendar, so it is drawable even where `Intl` lacks
   * Umm al-Qura (the others quietly collapse onto it there).
   *
   * Every key is always present: where the calendar is
   * unavailable, or the record is younger than a window, the narrower periods collapse onto the
   * lifetime one and carry the identical line — which costs nothing, since identical windows hit
   * the same tally memo.
   */
  seriesByPeriod: Record<SeriesPeriod, RecordSeries>;
  /**
   * The periods worth offering, narrowest first — those with two settled points to draw a line
   * between, and a shape no wider period already draws. Never empty (`life` always survives), so
   * `length === 1` is the signal that there is nothing to choose and no selector to show.
   */
  seriesPeriods: SeriesPeriod[];
};

/**
 * Overlay a set of known-done habit ids onto `day`'s completion rows. The day-complete overlay
 * fires the instant the day closes — BEFORE the last ticks have round-tripped to the server — so a
 * plain fetch undercounts and its degrees read below the Progress tab's (e.g. 74° vs 77°). Feeding
 * it the caller's optimistic "done today" set (the ids the day-complete rule already proved done)
 * keeps both readings on the same data, so they agree. Pure. Replaces any existing row for those
 * habits on `day` with a 'done' row — a count goal that closed the day has reached its target, so it
 * earns full credit. No-op when `doneIds` is empty (every other caller).
 */
export function withDoneToday(completions: CompletionRow[], doneIds: string[], day: string): CompletionRow[] {
  if (doneIds.length === 0) return completions;
  const done = new Set(doneIds);
  const kept = completions.filter((r) => !(r.completed_at === day && done.has(r.habit_id)));
  const injected: CompletionRow[] = doneIds.map((habit_id) => ({ habit_id, completed_at: day, status: 'done', count: null }));
  return [...kept, ...injected];
}

/**
 * One scheduled habit's credit toward a day's completion, given its completion `row` for that day
 * (`undefined` when nothing was logged). `null` = excused (a 'skipped' day — dropped from BOTH
 * numerator and denominator, so it never reads as a miss); otherwise 0–1. A count goal earns
 * `count ÷ target` (capped at 1, full on 'done'); a binary habit earns 1 when 'done', else 0.
 *
 * The single source of truth for the completion rule — shared by {@link computeProgress} and the
 * per-habit stats ({@link import('./habit-stats').computeHabitStats}), so the two can never drift.
 */
export function creditFor(habit: { target_count?: number | null }, row: CompletionRow | undefined): number | null {
  if (row?.status === 'skipped') return null; // excused — out of the rate entirely
  if (habit.target_count && habit.target_count > 0) {
    if (row?.status === 'done') return 1; // reached target
    return clamp01((row?.count ?? 0) / habit.target_count); // in-progress count goal
  }
  return row?.status === 'done' ? 1 : 0; // binary
}

/** One bucket's span, before it has been tallied. */
type Span = { start: string; end: string };

/**
 * Buckets of a fixed width, laid BACKWARDS from `end` — so the newest is the one being lived and
 * any short bucket falls at the far end, where it is oldest and least read.
 */
function uniformSpans(start: string, end: string, bucketDays: number): Span[] {
  const spans: Span[] = [];
  for (let cursor = end; cursor >= start; ) {
    const reach = addDaysISO(cursor, -(bucketDays - 1));
    const from = reach < start ? start : reach;
    spans.push({ start: from, end: cursor });
    cursor = addDaysISO(from, -1);
  }
  return spans.reverse(); // built newest-first; a record reads forward
}

/**
 * One bucket per Hijri month across `start`…`end`, clipped to that window at both ends — so the
 * first month shows only the part of it on record and the last ends on today rather than running
 * out into days not yet lived.
 */
function monthlySpans(start: string, end: string): Span[] {
  const spans: Span[] = [];
  for (let cursor = start; cursor <= end; ) {
    const range = hijriMonthRange(cursor);
    if (!range) break; // no Islamic calendar — the caller falls back to a uniform shape
    const to = range.end < end ? range.end : end;
    spans.push({ start: cursor, end: to });
    cursor = addDaysISO(to, 1);
  }
  return spans;
}

/**
 * Turn bucket spans into the drawn line.
 *
 * `trimLeadingEmpty` drops opening buckets that asked nothing, and is TRUE only where the window's
 * start is the record's own opening. The record begins where it first ASKED something, not where a
 * habit was created — a habit made on a Tuesday and scheduled for Fridays leaves days that were
 * never anyone's to keep. But a *calendar* window is a different claim: a month that has started
 * while nothing is due yet has real empty days at its head, and erasing them would report the month
 * as not begun.
 */
function buildSeries(
  spans: Span[],
  period: SeriesPeriod,
  bucketDays: number,
  today: string,
  tally: (startISO: string, endISO: string) => { done: number; possible: number },
  trimLeadingEmpty: boolean,
): RecordSeries {
  let points: SeriesPoint[] = spans.map(({ start, end }) => {
    const { done, possible } = tally(start, end);
    return { iso: start, endISO: end, rate: possible > 0 ? done / possible : 0, possible, pending: end === today };
  });
  if (trimLeadingEmpty) {
    const first = points.findIndex((p) => p.possible > 0);
    points = first < 0 ? [] : points.slice(first);
  }
  return { points, bucketDays, sinceISO: points[0]?.iso ?? null, period };
}

/** Buckets settled enough to draw a line between — a pending bucket is still being lived, and one
 *  that asked nothing carries no reading. */
function closedCount(series: RecordSeries): number {
  return series.points.reduce((n, p) => (p.possible > 0 && !p.pending ? n + 1 : n), 0);
}

/** A line's bucket boundaries as one comparable string — two periods with the same shape draw the
 *  same picture, whatever they are called. */
function shapeOf(series: RecordSeries): string {
  return series.points.map((p) => `${p.iso}/${p.endISO}`).join(' ');
}

/** Narrowest first — the order the selector offers periods in, and the order ties resolve against
 *  (a wider name wins, because it is the truer description of the same line). */
const PERIOD_ORDER: readonly SeriesPeriod[] = ['week', 'month', 'year', 'life'];

/** The last seven days — the app's own rhythm, since habits are scheduled by weekday. */
const WEEK_DAYS = 7;

/**
 * How much of the month is still ahead of you, as a phrase. The last day says so by name rather
 * than counting down to a zero, which reads as an error.
 *
 * Shared, because two places say it and they must say it identically: the hero's reading line and
 * the day-complete celebration.
 */
export function daysLeftLabel({ dayOfMonth, monthLength }: Pick<MonthProgress, 'dayOfMonth' | 'monthLength'>): string {
  const left = monthLength - dayOfMonth;
  return left <= 0 ? 'Last day of the month' : `${left} ${left === 1 ? 'day' : 'days'} left`;
}

/**
 * The app's completion rule over a set of rows, as one callable: `undefined` where the act was
 * not due that day, `null` where it was excused, otherwise its credit (0–1).
 *
 * Three-valued on purpose, and the same shape
 * {@link import('./habit-stats').statsFromDailyCredit} takes — "not due" and "excused" have to be
 * told apart (an excused day leaves the rate entirely; a day the act never ran on was never in
 * it), and collapsing them is the classic way a habit's rate quietly starts counting Fridays it
 * was never scheduled for.
 */
function creditOnDay(
  completions: CompletionRow[],
): (habit: ProgressHabit, iso: string) => number | null | undefined {
  // date → (habit id → its completion row) for that day.
  const rowByDate = new Map<string, Map<string, CompletionRow>>();
  for (const row of completions) {
    let m = rowByDate.get(row.completed_at);
    if (!m) {
      m = new Map();
      rowByDate.set(row.completed_at, m);
    }
    m.set(row.habit_id, row);
  }
  return (habit, iso) => (scheduledOn(habit, iso) ? creditFor(habit, rowByDate.get(iso)?.get(habit.id)) : undefined);
}

/** Derive every progress metric from the raw rows. Pure — easy to reason about and test. */
export function computeProgress(
  habits: ProgressHabit[],
  completions: CompletionRow[],
  today: string,
): ProgressDerived {
  // The shared completion rule (see {@link creditOnDay}): `undefined` = not due, `null` = excused
  // (dropped from numerator AND denominator, so it never counts as a miss — travel/period days
  // can still read a full orbit); otherwise 0–1, a count goal earning `count ÷ target`.
  const credit = creditOnDay(completions);

  // This Hijri month vs last, as a completion *rate* (done / scheduled). A rate
  // normalises across changing habit counts and month lengths, so 100% always
  // means a perfect month regardless of how many acts that is.
  // Memoized per call by range: the ring, the year strip, and the trend walk each re-tally
  // ranges another already swept (the previous whole month alone is asked for twice, and the
  // current month's two tallies recur in the year strip) — each sweep is days × habits of
  // schedule checks, so the dedup roughly halves the recompute.
  const tallyCache = new Map<string, { done: number; possible: number }>();
  const tallyRange = (startISO: string, endISO: string): { done: number; possible: number } => {
    const key = `${startISO}|${endISO}`;
    const hit = tallyCache.get(key);
    if (hit) return hit;
    let done = 0;
    let possible = 0;
    for (let day = startISO; day <= endISO; day = addDaysISO(day, 1)) {
      for (const h of habits) {
        const earned = credit(h, day);
        if (earned === undefined || earned === null) continue; // not due, or excused
        possible += 1;
        done += earned; // count goals add a fraction; binary habits add 1 or 0
      }
    }
    const tally = { done, possible };
    tallyCache.set(key, tally);
    return tally;
  };
  let month: MonthProgress | null = null;
  const thisRange = hijriMonthRange(today);
  if (thisRange) {
    const dayOfMonth = hijriParts(today)!.day; // thisRange is non-null ⟹ hijriParts(today) is too
    // The ring measures progress through the WHOLE month: the numerator is acts completed
    // month-to-date, but the denominator is every act scheduled across the full month. So a
    // single perfect day is a small slice — 360° means the whole month is done, never "100%
    // of what was possible so far" (which made one perfect day fill the orbit).
    const here = tallyRange(thisRange.start, today); // month-to-date → the done count
    const whole = tallyRange(thisRange.start, thisRange.end); // whole month → the denominator
    // Every prior month on record, each on the same whole-month scale as the headline: completed
    // through the matching Hijri day, over that month's full possible. So each entry answers "what
    // fraction of that whole month had I done by this point in it" — directly comparable to
    // `thisRate`, which is what lets the caret and the bright arc share one ring.
    //
    // Walked newest-first and bounded at a Hijri year, the same window (and the same
    // stop-at-the-first-untracked-month rule) as the rising-months walk further down. The walk is
    // cheap: `tallyRange` is memoised, and the whole-month tallies it needs are the very ones that
    // walk asks for.
    const priorRates: number[] = [];
    let priorCursor = addDaysISO(thisRange.start, -1); // the last day of the previous month
    for (let back = 0; back < MONTHS_BACK; back += 1) {
      const range = hijriMonthRange(priorCursor);
      if (!range) break;
      const priorWhole = tallyRange(range.start, range.end);
      if (priorWhole.possible === 0) break; // nothing was ever scheduled — before tracking began
      // Clamped: a 29-day month has no day 30, and on such a day the whole month is what counts.
      const limit = addDaysISO(range.start, Math.min(dayOfMonth, range.length) - 1);
      priorRates.push(tallyRange(range.start, limit).done / priorWhole.possible);
      priorCursor = addDaysISO(range.start, -1);
    }
    month = {
      monthName: thisRange.monthName,
      year: thisRange.year,
      dayOfMonth,
      monthLength: thisRange.length,
      // Computed once here so every chart reads the same rate (no inline done/possible divides).
      thisRate: whole.possible > 0 ? here.done / whole.possible : 0,
      // The month's own position on that same orbit: what it has ASKED so far over what it asks in
      // full. `here.possible` was already swept for the numerator's sake — the benchmark is free.
      paceRate: whole.possible > 0 ? here.possible / whole.possible : 0,
      averageRate: priorRates.length > 0 ? priorRates.reduce((sum, r) => sum + r, 0) / priorRates.length : 0,
      monthsAveraged: priorRates.length,
      // The newest entry of the same walk — one source of truth for "by this same day", so the
      // caret's average and the celebration's "last month" can never be measured differently.
      previousRate: priorRates[0] ?? 0,
      hasPrevious: priorRates.length > 0,
    };
  }

  // Where the record opens: the oldest habit's own first day, and so where the line begins. Read
  // off `created_at` rather than by hunting for the first scheduled day — that hunt would be
  // another day-by-day sweep, and the two answers differ by at most the few days between creating
  // a habit and its first scheduled one.
  //
  // (This used to be the tail of a walk back through every Hijri year, beside a second walk across
  // the twelve months of this one. The chart draws the whole record at a grain that follows its
  // length, so both were computing, at two fixed scales, what one series now says at every scale.)
  const opened = habits.reduce<string | null>((oldest, h) => {
    if (!h.created_at) return oldest; // an optimistic row not yet persisted — it has no history
    const day = createdDayISO(h.created_at);
    return oldest === null || day < oldest ? day : oldest;
  }, null);

  // The improvement trend: walk BACK from this month across closed months (crossing the Hijri
  // year boundary — the year strip above can't power this, it restarts every Muḥarram), collecting
  // each one's whole-month rate until the first month with nothing scheduled (before tracking
  // began) or the window's honest capacity (the fetch pulls ~a year). Then count the strictly
  // rising run from the most recent closed month backward.
  let trend: TrendSummary | null = null;
  if (thisRange) {
    const rates: { rate: number; monthName: string }[] = []; // newest complete month first
    let cursor = addDaysISO(thisRange.start, -1); // the last day of the previous month
    for (let back = 0; back < MONTHS_BACK; back += 1) {
      const range = hijriMonthRange(cursor);
      if (!range) break;
      const tally = tallyRange(range.start, range.end);
      if (tally.possible === 0) break; // nothing was ever scheduled — before tracking began
      rates.push({ rate: tally.done / tally.possible, monthName: range.monthName });
      cursor = addDaysISO(range.start, -1);
    }
    // Strict `>` — rates are exact rationals, and a plateau is not a rise.
    let increases = 0;
    while (increases + 1 < rates.length && rates[increases]!.rate > rates[increases + 1]!.rate) increases += 1;
    trend =
      increases >= 2
        ? { risingMonths: increases + 1, sinceMonthName: rates[increases]!.monthName }
        : { risingMonths: 0, sinceMonthName: null };
  }

  // The record as a line, over each period it can be read at. Every other figure on the screen is
  // a whole-PERIOD rate, so a bucket is measured the same way against its own schedule — a full
  // orbit is a span fully kept. Each bucket is a `tallyRange`, riding the same memo and the same
  // excusal/count-goal rules as every other figure.
  //
  // All four are computed here, eagerly, rather than handed out as a builder: every window ends on
  // today, so windows that clamp to the same start have identical bucket boundaries and cost
  // nothing beyond the first (which is the common young-record case). Paying once, inside the
  // hook's existing memo, is what makes tapping the selector free.
  const live = opened !== null && opened <= today;
  // Each window opens at its own boundary or at the record's, whichever is later. Clamping is what
  // makes a young record's periods collapse onto one another — and so what makes `seriesPeriods`
  // shrink on its own, with no threshold rule anywhere.
  const from = (boundary: string | null | undefined): string =>
    boundary == null || opened === null || boundary < opened ? opened! : boundary;
  const lifeBucketDays = live ? Math.max(1, Math.ceil((daysBetweenISO(opened, today) + 1) / SERIES_MAX_POINTS)) : 1;

  const empty = (period: SeriesPeriod): RecordSeries => ({ points: [], bucketDays: 1, sinceISO: null, period });
  const build = (period: SeriesPeriod, start: string, spans: Span[], bucketDays: number): RecordSeries =>
    buildSeries(spans, period, bucketDays, today, tallyRange, start === opened);

  const weekStart = live ? from(addDaysISO(today, -(WEEK_DAYS - 1))) : today;
  const monthStart = live ? from(thisRange?.start) : today;
  const yearStart = live ? from(hijriYearRange(today)?.start) : today;
  // A year is read one Hijri month at a time. Where the calendar is missing there are no months to
  // walk, so `monthlySpans` comes back empty and the period simply never gets offered.
  const yearSpans = live ? monthlySpans(yearStart, today) : [];
  const seriesByPeriod: Record<SeriesPeriod, RecordSeries> = live
    ? {
        week: build('week', weekStart, uniformSpans(weekStart, today, 1), 1),
        month: build('month', monthStart, uniformSpans(monthStart, today, 1), 1),
        // 0 bucketDays: a Hijri month is 29 or 30 days, so these have no single width.
        year: build('year', yearStart, yearSpans, 0),
        life: build('life', opened, uniformSpans(opened, today, lifeBucketDays), lifeBucketDays),
      }
    : { week: empty('week'), month: empty('month'), year: empty('year'), life: empty('life') };

  // Offer a period only where it draws something a wider one doesn't already say. Two settled
  // points is the floor — one point is a dot, and a line between a dot and a day still being lived
  // is a slope invented from nothing.
  const seriesPeriods = PERIOD_ORDER.filter((period, i) => {
    if (period === 'life') return true; // the record itself is always readable
    if (closedCount(seriesByPeriod[period]) < 2) return false;
    return PERIOD_ORDER.slice(i + 1).every((wider) => shapeOf(seriesByPeriod[wider]) !== shapeOf(seriesByPeriod[period]));
  });

  return { habitsCount: habits.length, month, trend, seriesByPeriod, seriesPeriods };
}
