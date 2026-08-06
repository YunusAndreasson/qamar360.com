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
  hijriMonthRange,
  hijriParts,
  hijriYearStart,
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
  /** Previous Hijri month name, for the pace comparison ("vs last month"). */
  previousMonthName: string;
  /**
   * Last month by this same Hijri day, on the same whole-month scale (0–1): acts done through
   * the matching day ÷ last month's full possible — directly comparable to {@link thisRate}.
   */
  previousRate: number;
  /** Whether last month was tracked at all (false → the user's first month; hide the pace tick). */
  hasPrevious: boolean;
};

/** One Hijri month of the current year, for the "This year" bars. */
export type YearMonth = {
  /** 1-based Hijri month number (1 = Muharram … 12 = Dhul-Hijjah). */
  month: number;
  /** Hijri month name, e.g. "Rajab". */
  monthName: string;
  /** Completion rate, 0–1 — full month for the past, whole-month progress for the current, 0 for the future. */
  fraction: number;
  /** 'past' = fully elapsed, 'current' = contains today, 'future' = not yet begun. */
  state: 'past' | 'current' | 'future';
};

/**
 * This Hijri year as its 12 months — the "year in moons" strip. `null` when the
 * Islamic calendar is unavailable.
 */
export type YearProgress = {
  /** Hijri year, e.g. 1448. */
  year: number;
  /** Muharram → Dhul-Hijjah, always length 12. */
  months: YearMonth[];
};

/** One Hijri year of a life — the unit of the "This life" card. */
export type LifeYear = {
  /** Hijri year, e.g. 1447. */
  year: number;
  /** Completion rate, 0–1: done ÷ scheduled across the whole year (to date, for the current one). */
  fraction: number;
  /** 'past' = fully elapsed, 'current' = contains today. */
  state: 'past' | 'current';
};

/**
 * Every Hijri year the user has kept anything at all — the long view, from the first year with
 * something scheduled in it to the one running now. `null` when the Islamic calendar is
 * unavailable; `years` is never empty when it isn't (a user with no history at all yields `null`).
 */
export type LifeProgress = {
  /** Oldest year first, ending with the current one. */
  years: LifeYear[];
  /** The Hijri month the record opens in, e.g. "Rajab" — where the whole thing began. */
  sinceMonthName: string;
  /** The Hijri year the record opens in. */
  sinceYear: number;
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
  /** This Hijri year as 12 months — the year bars, or `null` if unavailable. */
  year: YearProgress | null;
  /** Every Hijri year on record — the "This life" card, or `null` if there is no record yet. */
  life: LifeProgress | null;
  /** The rising-months statement ("Rising since …"), or `null` if the calendar is unavailable. */
  trend: TrendSummary | null;
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

/** Derive every progress metric from the raw rows. Pure — easy to reason about and test. */
export function computeProgress(
  habits: ProgressHabit[],
  completions: CompletionRow[],
  today: string,
): ProgressDerived {
  // date → (habit id → its completion row) for that day. A skipped act is excluded from the
  // rate entirely (numerator AND denominator), so it never counts as a miss — travel/period
  // days can still read 100%. A count goal earns partial credit (count ÷ target); a 'partial'
  // row is an in-progress count goal.
  const rowByDate = new Map<string, Map<string, CompletionRow>>();
  for (const row of completions) {
    let m = rowByDate.get(row.completed_at);
    if (!m) {
      m = new Map();
      rowByDate.set(row.completed_at, m);
    }
    m.set(row.habit_id, row);
  }

  // One scheduled habit's credit toward a day's rate — the shared completion rule (see
  // {@link creditFor}): `null` = excused (drop from numerator AND denominator); otherwise 0–1.
  const habitCredit = (h: ProgressHabit, iso: string): number | null => creditFor(h, rowByDate.get(iso)?.get(h.id));

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
        if (!scheduledOn(h, day)) continue;
        const credit = habitCredit(h, day);
        if (credit === null) continue; // excused — excluded from done and possible
        possible += 1;
        done += credit; // count goals add a fraction; binary habits add 1 or 0
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
    const previousRange = hijriMonthRange(addDaysISO(thisRange.start, -1));
    // Last month on the same whole-month scale: completed through the matching Hijri day, over
    // last month's full possible — so the orbit's "vs last month" tick reads as a comparable
    // position to the headline (both are "fraction of that whole month done by this point").
    const previousLimit = previousRange
      ? addDaysISO(previousRange.start, Math.min(dayOfMonth, previousRange.length) - 1)
      : null;
    const previousThrough = previousRange && previousLimit ? tallyRange(previousRange.start, previousLimit) : { done: 0, possible: 0 };
    const previousWhole = previousRange ? tallyRange(previousRange.start, previousRange.end) : { done: 0, possible: 0 };
    month = {
      monthName: thisRange.monthName,
      year: thisRange.year,
      dayOfMonth,
      monthLength: thisRange.length,
      // Computed once here so every chart reads the same rate (no inline done/possible divides).
      thisRate: whole.possible > 0 ? here.done / whole.possible : 0,
      previousMonthName: previousRange?.monthName ?? '',
      previousRate: previousWhole.possible > 0 ? previousThrough.done / previousWhole.possible : 0,
      hasPrevious: previousWhole.possible > 0,
    };
  }

  // This Hijri year as its 12 months — Muharram → Dhul-Hijjah. Past months carry their
  // full rate, the current month its whole-month progress (done-to-date over the whole
  // month), future months are empty (new moons). Walks forward month by month from 1
  // Muharram using the same day arithmetic.
  let year: YearProgress | null = null;
  const yearStart = hijriYearStart(today);
  if (yearStart) {
    const months: YearMonth[] = [];
    let cursor = yearStart.start;
    for (let m = 1; m <= 12; m += 1) {
      const range = hijriMonthRange(cursor);
      if (!range) break;
      let state: YearMonth['state'];
      let tally = { done: 0, possible: 0 };
      if (range.start > today) {
        state = 'future';
      } else if (range.end <= today) {
        state = 'past';
        tally = tallyRange(range.start, range.end); // a fully elapsed month — full-month rate
      } else {
        state = 'current';
        // Same whole-month denominator as the month ring (done month-to-date, possible over the
        // whole month), so the current moon fills gradually instead of snapping full on day 1.
        tally = { done: tallyRange(range.start, today).done, possible: tallyRange(range.start, range.end).possible };
      }
      months.push({
        month: m,
        monthName: range.monthName,
        fraction: tally.possible ? tally.done / tally.possible : 0,
        state,
      });
      cursor = addDaysISO(range.end, 1); // the 1st of the next Hijri month
    }
    if (months.length === 12) year = { year: yearStart.year, months };
  }

  // Every Hijri year on record — the long view. Walk BACK from this year, one Hijri year at a
  // time, taking each year's whole-year rate, and stop at the first year with nothing scheduled in
  // it: that is where the record begins (habits carry `created_at`, so `scheduledOn` is already
  // false before a habit existed). The current year is measured like the current month on the year
  // strip — done-to-date over the WHOLE year's possible — so it fills gradually instead of
  // snapping full in Muḥarram.
  //
  // Bounded at 120 years, which is a guard against a corrupt date rather than a real limit.
  let life: LifeProgress | null = null;
  const currentYear = hijriYearStart(today);
  if (currentYear) {
    const years: LifeYear[] = [];
    let cursor: string | null = currentYear.start;
    for (let back = 0; cursor && back < 120; back += 1) {
      const yearStartISO: string = cursor;
      const startParts = hijriParts(yearStartISO);
      if (!startParts) break;
      // The last day of this Hijri year = the day before the next year's 1 Muḥarram. For the
      // current year that lies in the future, which is exactly what the denominator wants.
      const nextStart = hijriYearStart(addDaysISO(yearStartISO, 400))?.start;
      const yearEnd = nextStart ? addDaysISO(nextStart, -1) : today;
      const whole = tallyRange(yearStartISO, yearEnd);
      if (whole.possible === 0) break; // before anything was ever scheduled — the record starts after this
      const isCurrent = yearStartISO <= today && today <= yearEnd;
      const done = isCurrent ? tallyRange(yearStartISO, today).done : whole.done;
      years.push({
        year: startParts.year,
        fraction: whole.possible ? done / whole.possible : 0,
        state: isCurrent ? 'current' : 'past',
      });
      cursor = hijriYearStart(addDaysISO(yearStartISO, -1))?.start ?? null;
    }
    // Where the record opens: the oldest habit's own first day. Read off `created_at` rather than
    // by hunting for the first scheduled day — that hunt would be another day-by-day sweep, and
    // the two answers differ by at most the few days between creating a habit and its first
    // scheduled one.
    const opened = habits.reduce<string | null>((oldest, h) => {
      if (!h.created_at) return oldest; // an optimistic row not yet persisted — it has no history
      const day = createdDayISO(h.created_at);
      return oldest === null || day < oldest ? day : oldest;
    }, null);
    const openRange = opened ? hijriMonthRange(opened) : null;
    if (years.length > 0 && openRange) {
      years.reverse(); // oldest first — a life reads forward
      life = { years, sinceMonthName: openRange.monthName, sinceYear: openRange.year };
    }
  }

  // The improvement trend: walk BACK from this month across closed months (crossing the Hijri
  // year boundary — the year strip above can't power this, it restarts every Muḥarram), collecting
  // each one's whole-month rate until the first month with nothing scheduled (before tracking
  // began) or the window's honest capacity (the fetch pulls ~a year). Then count the strictly
  // rising run from the most recent closed month backward.
  let trend: TrendSummary | null = null;
  if (thisRange) {
    const rates: { rate: number; monthName: string }[] = []; // newest complete month first
    let cursor = addDaysISO(thisRange.start, -1); // the last day of the previous month
    for (let back = 0; back < 12; back += 1) {
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

  return { habitsCount: habits.length, month, year, life, trend };
}
