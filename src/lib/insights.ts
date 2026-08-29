/**
 * What a moon quarter has to say.
 *
 * Four times a lunar month — on Hijri days 1, 8, 15 and 22, the same grid the lunar updates
 * fire on ({@link MILESTONE_DAYS}) — a *reading* is written about the quarter that has just
 * closed, and set beside the quarter before it. Reading and notification are one text: the
 * notification carries the reading's headline, and tapping it opens the reading in full.
 *
 * **Nothing is stored.** A reading is derived from the completion rows every time it is asked
 * for, exactly as the orbit and the chart are, which is what lets the whole back-catalogue
 * appear at once and keeps a reading from ever disagreeing with the instruments above it.
 * That in turn demands the derivation be *deterministic* — no clock, no randomness — so the
 * same history always writes the same feed.
 *
 * **Why detectors rather than a template.** Four reports a month that all say "you did N°"
 * stop being read by the second month. So each reading runs a set of small noticings over the
 * quarter, scores them, and leads with the best one that hasn't led recently
 * ({@link RECENCY_WINDOW}). The comparison the user actually asked for — this quarter against
 * the last — is never *absent*: it rotates in and out of the headline, but every reading
 * carries it as its figures.
 *
 * **Two voices, one rule.** A noticing that names a slip is honest and useful on a screen
 * someone chose to open, and is never right on a lock screen arriving unbidden. Hence
 * {@link Noticing.notifiable}, and the blanket zero-guard in {@link computeReadings}: a
 * quarter that earned nothing says nothing to a notification, the same silence
 * {@link import('./lunar-update').lunarUpdateCopy} already keeps.
 */
import {
  addDaysISO,
  createdDayISO,
  daysBetweenISO,
  hijriMonthRange,
  hijriParts,
  WEEKDAY_NAMES,
  weekdayIndex,
} from '@/lib/dates';
import { MILESTONE_DAYS, type MilestoneDay, phaseOf, type LunarPhase } from '@/lib/lunar-phase';
import { type ProgressHabit, toDegrees } from '@/lib/progress';

/**
 * How far back readings are written. A Hijri year of quarters is ~48 readings — enough that the
 * feed is a record rather than a recent-items list, and the same window the ring's average and
 * the rising-months trend already walk ({@link import('./progress').computeProgress}).
 */
const READINGS_BACK = 12;

/** How many previous readings a kind is held back over before it may lead again. */
const RECENCY_WINDOW = 3;

/** Credit is a sum of rationals; compare it to a day count with a tolerance, never with `===`. */
const EPSILON = 1e-9;

/**
 * The span a milestone opens: days 1–7, 8–14, 15–21, and 22 to the month's end (8 or 9 days,
 * since Umm al-Qura months run 29 or 30). The four partition the month exactly.
 */
type QuarterSpan = {
  startISO: string;
  /** Inclusive. */
  endISO: string;
  /** The Hijri day the quarter opens on — which is also the moon it opens under. */
  milestone: MilestoneDay;
  monthName: string;
  /** 1-based Hijri month number, for the reading's stable id. */
  monthNumber: number;
  year: number;
  /** Days in the span: 7, or 8–9 for the last quarter. */
  days: number;
};

/** One habit's share of a quarter, in the same credit units as the rest of the app. */
type HabitShare = {
  /** Days it was due (excused days excluded, as everywhere else). */
  possible: number;
  /** Credit earned across them — a count goal contributes a fraction. */
  earned: number;
};

/**
 * A quarter, tallied. `possible` spans the WHOLE quarter while `earned` covers only the days
 * lived so far — the same asymmetry that makes {@link import('./progress').MonthProgress.thisRate}
 * safe to bake into a notification days before it fires: the denominator is known in advance, so
 * a figure computed today is still exactly right on the quarter's last night unless something
 * was completed in between, and completing re-arms.
 *
 * Everything below `rate` describes the days actually lived, so on a still-open quarter they are
 * a partial picture — which is why only closed readings reach the feed.
 */
type QuarterTally = {
  span: QuarterSpan;
  /** 0–1: credit earned ÷ acts the whole quarter asks for. */
  rate: number;
  earned: number;
  possible: number;
  /** Days where every act still in play earned full credit. */
  sealedDays: number;
  /** The longest unbroken run of those, and where it fell. */
  longestRun: { days: number; startISO: string; endISO: string } | null;
  byHabit: Map<string, HabitShare>;
  /** Index 0–6 (Sunday first), matching {@link weekdayIndex}. */
  byWeekday: HabitShare[];
};

/**
 * The kinds of thing a reading can notice. Order is the deterministic tie-break when two
 * candidates score identically — earlier is more interesting.
 */
export const NOTICING_KINDS = [
  'first',
  'record',
  'return',
  'unbroken',
  'newcomer',
  'riser',
  'streak',
  'pace',
  'slipper',
  'weekday',
  'steady',
  'quiet',
] as const;

type NoticingKind = (typeof NOTICING_KINDS)[number];

export type Noticing = {
  kind: NoticingKind;
  /** The claim — complete and stopped, and readable with nothing else on screen. */
  headline: string;
  /** One sentence of evidence under it. */
  body: string;
  /** 0–1: how much this is worth saying, before the recency penalty. */
  salience: number;
  /** Whether this may go to a lock screen. A slip may not; see the module note. */
  notifiable: boolean;
};

export type Reading = {
  /** Stable and deterministic: the quarter's Hijri coordinates. Safe as a route param. */
  id: string;
  span: QuarterSpan;
  /** The moon the reading is published under — the milestone that CLOSES the quarter, so a
   *  reading and the notification that announced it are headed by the same phase. */
  phase: LunarPhase;
  phaseLabel: string;
  /** Illumination and direction for the card's glyph, at that same moon. */
  illumination: number;
  waxing: boolean;
  /** The day the reading is published: the quarter's last day, plus one. */
  publishedISO: string;
  quarter: QuarterTally;
  /** The quarter before it, when one asked anything. `null` on the first reading. */
  previous: QuarterTally | null;
  lead: Noticing;
  /** The rest, best first — the detail screen's supporting rows. */
  also: Noticing[];
  /** False while the quarter is still being lived. Only closed readings belong in the feed. */
  closed: boolean;
};

/** Whether a habit knows its own name — optional on {@link ProgressHabit}, since the progress
 *  math itself never needs one and its fixtures don't carry one. */
type NamedHabit = ProgressHabit & { name?: string | null };

/**
 * A habit's credit on a day: `undefined` when it wasn't due, `null` when it was excused, else
 * 0–1. The same three-valued seam
 * {@link import('./habit-stats').statsFromDailyCredit} uses, so the two sweeps apply one
 * completion rule and can't drift.
 */
export type QuarterCredit = (habit: NamedHabit, iso: string) => number | null | undefined;

/** The four quarters of one Hijri month, oldest first. */
function quarterSpansOf(range: { start: string; end: string; monthName: string; year: number }): QuarterSpan[] {
  const monthNumber = hijriParts(range.start)?.month ?? 0;
  return MILESTONE_DAYS.map((milestone, i) => {
    const next = MILESTONE_DAYS[i + 1];
    const startISO = addDaysISO(range.start, milestone - 1);
    // Up to the day before the next milestone; the last quarter runs to the month's own end,
    // which is what makes it 8 or 9 days rather than 7.
    const endISO = next === undefined ? range.end : addDaysISO(range.start, next - 2);
    return {
      startISO,
      endISO,
      milestone,
      monthName: range.monthName,
      monthNumber,
      year: range.year,
      days: daysBetweenISO(startISO, endISO) + 1,
    };
  });
}

/**
 * Every quarter that has opened, oldest first, back {@link READINGS_BACK} Hijri months. Empty
 * on a runtime whose `Intl` lacks the Umm al-Qura calendar — there are no Hijri quarters to
 * read, and the caller shows that rather than measuring against a wrong calendar.
 */
function quarterSpans(today: string): QuarterSpan[] {
  const months: { start: string; end: string; monthName: string; year: number }[] = [];
  let cursor = today;
  for (let back = 0; back < READINGS_BACK; back += 1) {
    const range = hijriMonthRange(cursor);
    if (!range) break;
    months.push(range);
    cursor = addDaysISO(range.start, -1); // the last day of the previous month
  }
  return months
    .reverse()
    .flatMap(quarterSpansOf)
    .filter((span) => span.startISO <= today);
}

function tallyQuarter(span: QuarterSpan, habits: NamedHabit[], credit: QuarterCredit, today: string): QuarterTally {
  const lastLived = span.endISO < today ? span.endISO : today;
  const byHabit = new Map<string, HabitShare>();
  const byWeekday: HabitShare[] = Array.from({ length: 7 }, () => ({ possible: 0, earned: 0 }));
  let earned = 0;
  let possible = 0;
  let sealedDays = 0;
  let longestRun: QuarterTally['longestRun'] = null;
  let runStart: string | null = null;

  for (let day = span.startISO; day <= span.endISO; day = addDaysISO(day, 1)) {
    const lived = day <= lastLived;
    const weekday = byWeekday[weekdayIndex(day)]!;
    let dayDue = 0;
    let dayEarned = 0;

    for (const habit of habits) {
      const value = credit(habit, day);
      if (value === undefined || value === null) continue; // not due, or excused
      possible += 1;
      if (!lived) continue; // a day still ahead asks, but cannot have answered
      earned += value;
      dayDue += 1;
      dayEarned += value;
      const share = byHabit.get(habit.id) ?? { possible: 0, earned: 0 };
      share.possible += 1;
      share.earned += value;
      byHabit.set(habit.id, share);
      weekday.possible += 1;
      weekday.earned += value;
    }

    const sealed = dayDue > 0 && dayEarned >= dayDue - EPSILON;
    if (sealed) {
      sealedDays += 1;
      runStart ??= day;
      const days = daysBetweenISO(runStart, day) + 1;
      if (!longestRun || days > longestRun.days) longestRun = { days, startISO: runStart, endISO: day };
    } else {
      runStart = null;
    }
  }

  return {
    span,
    rate: possible > 0 ? earned / possible : 0,
    earned,
    possible,
    sealedDays,
    longestRun,
    byHabit,
    byWeekday,
  };
}

/** A rate as whole days of its own quarter — the translation that makes a degree figure mean
 *  something. `38° of a 7-day quarter` is `about one more day`. */
function daysOf(rate: number, span: QuarterSpan): number {
  return Math.max(1, Math.round(rate * span.days));
}

/** Credit as a day count, for copy that says "5 of 7 days". */
const asDays = (credit: number): number => Math.round(credit);

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A span named in Hijri days, e.g. "1–7 Muḥarram" — or across a month boundary, both ends.
 *
 * `withMonth: false` drops the month name, for a caller that has already said it — the feed's
 * archive rows sit under a section titled with their own Hijri month, where repeating it spends
 * the caption on a fact already on screen. A span that CROSSES a boundary keeps both months
 * whatever is asked: there the month is not decoration, it is what makes "29–7" a span at all.
 *
 * An optional argument rather than a second exported form, so the two can never drift apart.
 */
export function spanLabel(
  span: { startISO: string; endISO: string; monthName: string },
  { withMonth = true }: { withMonth?: boolean } = {},
): string {
  const from = hijriParts(span.startISO);
  const to = hijriParts(span.endISO);
  if (!from || !to) return span.monthName;
  if (from.month !== to.month) return `${from.day} ${from.monthName} – ${to.day} ${to.monthName}`;
  return withMonth ? `${from.day}–${to.day} ${from.monthName}` : `${from.day}–${to.day}`;
}

type Context = {
  quarter: QuarterTally;
  previous: QuarterTally | null;
  /** Every quarter up to and including this one, oldest first — for records and running totals. */
  history: QuarterTally[];
  nameOf: (habitId: string) => string;
  /** Habits created inside this quarter, by id. */
  newIds: Set<string>;
  weekdayApplicable: boolean;
};

/**
 * Below half a day of the quarter, "better" is a thing rounding invented rather than something
 * that happened — the same argument, and the same shape, as the orbit hero's `usualLabel`.
 */
function deadBand(span: QuarterSpan): number {
  return 180 / span.days;
}

/** The act that moved furthest between the two quarters, in either direction. */
function mover(ctx: Context, direction: 1 | -1): { id: string; gap: number; here: HabitShare; there: HabitShare } | null {
  const { quarter, previous } = ctx;
  if (!previous) return null;
  let best: { id: string; gap: number; here: HabitShare; there: HabitShare } | null = null;
  for (const [id, here] of quarter.byHabit) {
    const there = previous.byHabit.get(id);
    if (!there || here.possible < 3 || there.possible < 3) continue; // too thin to be a movement
    const gap = (here.earned / here.possible - there.earned / there.possible) * direction;
    if (gap < 0.3) continue;
    if (!best || gap > best.gap) best = { id, gap, here, there };
  }
  return best;
}

const DETECTORS: ((ctx: Context) => Noticing | null)[] = [
  // The first reading of all. There is no comparison to make, so it says so and names the one
  // the next reading will make — the feature explaining itself, once, where it can't be missed.
  function first(ctx) {
    if (ctx.previous) return null;
    const degrees = toDegrees(ctx.quarter.rate);
    return {
      kind: 'first',
      headline: 'Your first quarter.',
      // Never the word "moon": the notification that carries this headline is already titled
      // with the phase, and one banner describing the same moon twice is the rule
      // `lunar-update.test.ts` has always held.
      body:
        degrees > 0
          ? `${degrees}° of it kept. The next reading has this one to measure against.`
          : 'Nothing closed yet. The next reading will have this one to measure against.',
      salience: 1,
      notifiable: true,
    };
  },

  // A high-water mark. Three quarters is the floor: with two, "your best yet" is a coin toss.
  function record(ctx) {
    const { quarter, history } = ctx;
    if (history.length < 3 || quarter.possible === 0) return null;
    const before = history.slice(0, -1).filter((q) => q.possible > 0);
    if (before.length === 0) return null;
    const best = before.reduce((top, q) => (q.rate > top.rate ? q : top));
    const perfect = quarter.rate >= 1;
    if (!perfect && quarter.rate <= best.rate) return null;
    return {
      kind: 'record',
      headline: perfect ? 'A whole quarter kept.' : 'Your strongest quarter yet.',
      body: perfect
        ? `Every act, on every day it was due.`
        : `${toDegrees(quarter.rate)}° this quarter, past the ${toDegrees(best.rate)}° you set in ${best.span.monthName}.`,
      salience: perfect ? 1 : 0.95,
      notifiable: true,
    };
  },

  // A record that restarts. Worth more than the raw figure: the quarter after an empty one is
  // the hardest to begin, and it is the one moment the app should say it noticed.
  function returned(ctx) {
    const { quarter, previous } = ctx;
    if (!previous || previous.possible === 0) return null;
    if (previous.rate > 0.05 || quarter.rate < 0.25) return null;
    return {
      kind: 'return',
      headline: 'You came back.',
      body: `${toDegrees(quarter.rate)}° this quarter, after one that stayed quiet.`,
      salience: 0.9,
      notifiable: true,
    };
  },

  // One act kept on every single day it asked for. The strongest thing that can be said about a
  // single habit, and the reason the app exists.
  function unbroken(ctx) {
    let best: { id: string; share: HabitShare } | null = null;
    for (const [id, share] of ctx.quarter.byHabit) {
      if (share.possible < 4 || share.earned < share.possible - EPSILON) continue;
      if (!best || share.possible > best.share.possible) best = { id, share };
    }
    if (!best) return null;
    return {
      kind: 'unbroken',
      headline: `${ctx.nameOf(best.id)}, every day it was due.`,
      body: `Kept on all ${plural(best.share.possible, 'day')} it asked for this quarter.`,
      salience: 0.8,
      notifiable: true,
    };
  },

  // Something begun this quarter, and how it landed. New things are interesting whether or not
  // they went well, so this fires either way and lets the copy carry the difference.
  function newcomer(ctx) {
    let best: { id: string; share: HabitShare } | null = null;
    for (const id of ctx.newIds) {
      const share = ctx.quarter.byHabit.get(id);
      if (!share || share.possible < 3) continue;
      if (!best || share.possible > best.share.possible) best = { id, share };
    }
    if (!best) return null;
    const rate = best.share.earned / best.share.possible;
    // Appositive, not a predicate: act names in this app are past-tense verbs ("Chose water"),
    // so "X has begun" reads as nonsense where "X, new this quarter" reads as a label.
    return {
      kind: 'newcomer',
      headline: rate >= 0.6 ? `${ctx.nameOf(best.id)}, new this quarter and kept.` : `${ctx.nameOf(best.id)}, new this quarter.`,
      body: `${asDays(best.share.earned)} of ${plural(best.share.possible, 'day')} since you added it.`,
      salience: 0.75,
      notifiable: true,
    };
  },

  // The act that gained the most ground — the interesting half of a quarter-on-quarter reading,
  // because it names *where* the movement came from rather than only that there was some.
  function riser(ctx) {
    const found = mover(ctx, 1);
    if (!found) return null;
    return {
      kind: 'riser',
      headline: `${ctx.nameOf(found.id)} rose the most.`,
      body: `${asDays(found.here.earned)} of ${plural(found.here.possible, 'day')} this quarter, against ${asDays(found.there.earned)} of ${found.there.possible} last quarter.`,
      salience: 0.7 + Math.min(0.2, found.gap * 0.2),
      notifiable: true,
    };
  },

  // A run of days closed end to end. Counted in whole days rather than acts, because a run is
  // the one thing the app measures that a person can also feel.
  function streak(ctx) {
    const run = ctx.quarter.longestRun;
    if (!run || run.days < 3) return null;
    return {
      kind: 'streak',
      headline: `${plural(run.days, 'day')} closed in a row.`,
      body: `${spanLabel({ ...run, monthName: ctx.quarter.span.monthName })}, the longest run of the quarter.`,
      salience: 0.5 + Math.min(0.3, run.days / (ctx.quarter.span.days * 2)),
      notifiable: true,
    };
  },

  // The comparison the reading exists for. It leads only when it is the most interesting thing
  // available, but the figures behind it are on every card regardless.
  function pace(ctx) {
    const { quarter, previous } = ctx;
    if (!previous || previous.possible === 0 || quarter.possible === 0) return null;
    const here = toDegrees(quarter.rate);
    const there = toDegrees(previous.rate);
    const gap = here - there;
    if (Math.abs(gap) <= deadBand(quarter.span)) return null; // `steady` has this
    const ahead = gap > 0;
    const days = daysOf(Math.abs(gap) / 360, quarter.span);
    return {
      kind: 'pace',
      headline: ahead ? `Ahead of last quarter, ${here}° against ${there}°.` : 'A quieter quarter than the last.',
      body: ahead
        ? `A gain of ${Math.abs(gap)}°, about ${plural(days, 'day')} more of the quarter kept.`
        : `${here}° this quarter, against ${there}° last quarter.`,
      salience: 0.4 + Math.min(0.35, Math.abs(gap) / 360),
      // Silence, not shame: a fall is worth knowing on a screen you opened, and is never worth
      // pushing to a lock screen.
      notifiable: ahead,
    };
  },

  // The act that gave up the most ground. Named as the one to pick back up, never as a failure —
  // and kept out of every notification.
  function slipper(ctx) {
    const found = mover(ctx, -1);
    if (!found) return null;
    return {
      kind: 'slipper',
      headline: `${ctx.nameOf(found.id)} is the one to pick back up.`,
      body: `${asDays(found.here.earned)} of ${plural(found.here.possible, 'day')} this quarter, against ${asDays(found.there.earned)} of ${found.there.possible} last quarter.`,
      salience: 0.6,
      notifiable: false,
    };
  },

  // Which weekday the record is strongest on. Read across the whole record rather than this
  // quarter — seven days give one sample per weekday, which is a coincidence, not a rhythm.
  function weekday(ctx) {
    if (!ctx.weekdayApplicable) return null;
    const totals = Array.from({ length: 7 }, () => ({ possible: 0, earned: 0 }));
    for (const q of ctx.history) {
      for (let i = 0; i < 7; i += 1) {
        totals[i]!.possible += q.byWeekday[i]!.possible;
        totals[i]!.earned += q.byWeekday[i]!.earned;
      }
    }
    const seen = totals.filter((t) => t.possible >= 8);
    if (seen.length < 4) return null; // too thin a record to name a day
    const overall = totals.reduce((sum, t) => sum + t.earned, 0) / totals.reduce((sum, t) => sum + t.possible, 0);
    let best = -1;
    let bestRate = 0;
    totals.forEach((t, i) => {
      if (t.possible < 8) return;
      const rate = t.earned / t.possible;
      if (best < 0 || rate > bestRate) {
        best = i;
        bestRate = rate;
      }
    });
    if (best < 0 || bestRate - overall < 0.15) return null; // no day stands out
    return {
      kind: 'weekday',
      headline: `${WEEKDAY_NAMES[best]} is your strongest day.`,
      body: `${toDegrees(bestRate)}° on a ${WEEKDAY_NAMES[best]} across the record, against ${toDegrees(overall)}° on an average day.`,
      salience: 0.45,
      notifiable: true,
    };
  },

  // Inside the dead band. An honest answer rather than a filler — a quarter that held its
  // ground held it, and saying so is better than inventing a direction out of rounding.
  function steady(ctx) {
    const { quarter, previous } = ctx;
    if (!previous || previous.possible === 0 || quarter.possible === 0) return null;
    const here = toDegrees(quarter.rate);
    const there = toDegrees(previous.rate);
    if (here === 0 && there === 0) return null; // `quiet` has this — see below
    if (Math.abs(here - there) > deadBand(quarter.span)) return null;
    return {
      kind: 'steady',
      headline: 'About the same as last quarter.',
      body: `${here}° against ${there}°, inside a day of it either way.`,
      salience: 0.3,
      notifiable: true,
    };
  },

  // A quarter where nothing closed, after another. Technically that IS "about the same as last
  // quarter", which is why `steady` has to stand aside: parity of nothing is not parity of
  // effort, and saying it that way would read as a shrug at someone who has stopped.
  //
  // It points forward rather than counting the silence back — a tally of quiet quarters is the
  // shame this app has a rule against — and it names the days, so a run of them reads as a run
  // of distinct nights rather than one sentence repeated.
  function quiet(ctx) {
    const { quarter, previous } = ctx;
    if (quarter.possible === 0 || toDegrees(quarter.rate) !== 0) return null;
    if (!previous || toDegrees(previous.rate) !== 0) return null;
    return {
      kind: 'quiet',
      headline: 'A quiet quarter.',
      body: `Nothing closed between ${spanLabel(quarter.span)}. The next one opens tonight.`,
      salience: 0.3,
      // The zero-guard in `computeReadings` would hold this back anyway; saying so here as well
      // means the rule survives anyone loosening that guard.
      notifiable: false,
    };
  },
];

/**
 * Rank the candidates, holding back anything that has led one of the last {@link RECENCY_WINDOW}
 * readings.
 *
 * The hold-back is **absolute**, not a penalty: a kind that led recently sorts below every kind
 * that didn't, however much more salient it is. A weighted penalty was tried first and did not
 * work — the salience spread between "an act kept every day" (0.8) and "your strongest weekday"
 * (0.45) is wider than any penalty that leaves the ordering sane, so the same headline led four
 * readings running while three other true things sat under it. Which is the exact failure the
 * detectors exist to prevent.
 *
 * Nothing is lost by it: a fact held back from the headline still appears in {@link Reading.also},
 * so "Fajr adhkār, every day it was due" is on all four cards. Only the *voice* rotates.
 *
 * Ties break on {@link NOTICING_KINDS} order, so one history always chooses one lead.
 */
function rank(candidates: Noticing[], recentLeads: NoticingKind[]): Noticing[] {
  return candidates
    .map((noticing) => ({ noticing, age: recentLeads.indexOf(noticing.kind) }))
    .sort(
      (a, b) =>
        // Fresh kinds first; among the held-back, the one that led longest ago.
        Number(a.age >= 0) - Number(b.age >= 0) ||
        b.age - a.age ||
        b.noticing.salience - a.noticing.salience ||
        NOTICING_KINDS.indexOf(a.noticing.kind) - NOTICING_KINDS.indexOf(b.noticing.kind),
    )
    .map((entry) => entry.noticing);
}

/** How many supporting noticings a reading keeps beyond its lead. */
const ALSO_MAX = 3;

/**
 * Every reading the record can write, newest first — closed quarters and the one still being
 * lived (flagged {@link Reading.closed}, so the feed can drop it while a notification armed
 * days ahead can still carry it).
 *
 * `credit` is the caller's completion rule; {@link import('./progress').computeProgress} passes
 * the same closure its own tallies run on, so a reading and the orbit above it are two views of
 * one sweep and can never disagree.
 */
export function computeReadings(habits: NamedHabit[], credit: QuarterCredit, today: string): Reading[] {
  const spans = quarterSpans(today);
  if (spans.length === 0) return [];

  const names = new Map(habits.map((h) => [h.id, h.name?.trim() || 'That act']));
  const weekdayApplicable = habits.some((h) => !h.hijri_schedule);
  // Read through {@link createdDayISO}, not off the raw timestamp: `created_at` is UTC and the
  // whole app keys days on the LOCAL calendar, so a habit made late on a Sunday evening west of
  // Greenwich would otherwise be dated into the following quarter.
  const bornOn = new Map(habits.filter((h) => h.created_at != null).map((h) => [h.id, createdDayISO(h.created_at!)]));

  const tallies = spans.map((span) => tallyQuarter(span, habits, credit, today));

  // The record opens where it first ASKED something — quarters before that are not empty, they
  // are prehistory, and a reading about them would report a life that wasn't being tracked.
  const opening = tallies.findIndex((q) => q.possible > 0);
  if (opening < 0) return [];

  const readings: Reading[] = [];
  const recentLeads: NoticingKind[] = []; // newest first

  for (let i = opening; i < tallies.length; i += 1) {
    const quarter = tallies[i]!;
    if (quarter.possible === 0) continue; // nothing was due — there is no quarter to read
    const before = tallies[i - 1];
    const previous = before && before.possible > 0 ? before : null;

    const ctx: Context = {
      quarter,
      previous,
      history: tallies.slice(opening, i + 1),
      nameOf: (id) => names.get(id) ?? 'That act',
      newIds: new Set(
        [...bornOn]
          .filter(([, day]) => day >= quarter.span.startISO && day <= quarter.span.endISO)
          .map(([id]) => id),
      ),
      weekdayApplicable,
    };

    const candidates = DETECTORS.map((detect) => detect(ctx)).filter((n): n is Noticing => n !== null);
    if (candidates.length === 0) continue;

    // A quarter that earned nothing has no figure worth pushing — the same silence the lunar
    // update already keeps for a 0° month. It still gets a reading; it just doesn't get pushed.
    const silent = toDegrees(quarter.rate) === 0;
    const ranked = rank(
      silent ? candidates.map((n) => ({ ...n, notifiable: false })) : candidates,
      recentLeads.slice(0, RECENCY_WINDOW),
    );

    const lead = ranked[0]!;
    // The moon the reading goes out under is the one that CLOSES the quarter — the day after
    // its last, which is the next milestone. So a reading and the notification announcing it
    // are headed by the same phase, and the card the user opens matches the banner they tapped.
    const publishedISO = addDaysISO(quarter.span.endISO, 1);
    const published = hijriParts(publishedISO);
    const publishedMonth = hijriMonthRange(publishedISO);
    const shape = phaseOf(published?.day ?? 1, publishedMonth?.length ?? 30);

    readings.push({
      id: `${quarter.span.year}-${quarter.span.monthNumber}-${quarter.span.milestone}`,
      span: quarter.span,
      phase: shape.phase,
      phaseLabel: shape.label,
      illumination: shape.illumination,
      waxing: shape.waxing,
      publishedISO,
      quarter,
      previous,
      lead,
      also: ranked.slice(1, 1 + ALSO_MAX),
      closed: quarter.span.endISO < today,
    });
    recentLeads.unshift(lead.kind);
  }

  return readings.reverse();
}

/**
 * The id of the most recently CLOSED quarter — the reading that should be waiting for you today.
 *
 * Purely calendrical: which quarter last closed is a fact about the Hijri date and nothing else,
 * so this needs no completions, no fetch and no habits. That is what lets the tab bar show an
 * unread dot without mounting a second all-time read of the record beside the one the tab itself
 * already does.
 *
 * `null` where the Umm al-Qura calendar is missing, or before the first quarter of the month has
 * closed and there is no earlier month to fall back to.
 */
export function latestReadingId(today: string): string | null {
  const parts = hijriParts(today);
  if (!parts) return null;
  // A quarter is published on the milestone that CLOSES it, so walk from the publication back to
  // the quarter — not from the quarter forward. The most recent publication is the last milestone
  // that has arrived; the reading it carried was about the quarter before that one.
  //
  // (Reading it the other way — "the last milestone before today" — is wrong for most of the
  // month: on day 14, milestone 8 has passed, but the quarter it opened runs to day 14 and has
  // not closed. What was published on day 8 was the quarter before it.)
  let published = 0; // index into MILESTONE_DAYS; day 1 always qualifies, so this always moves
  MILESTONE_DAYS.forEach((day, i) => {
    if (day <= parts.day) published = i;
  });
  if (published > 0) return `${parts.year}-${parts.month}-${MILESTONE_DAYS[published - 1]}`;
  // Published on day 1: the reading is of the PREVIOUS month's last quarter.
  const range = hijriMonthRange(today);
  const before = range && hijriParts(addDaysISO(range.start, -1));
  return before ? `${before.year}-${before.month}-22` : null;
}
