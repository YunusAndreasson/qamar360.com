/**
 * What a **stackless row** says and does — resolved once, as data, so the row can render it without
 * re-deriving a tri-state in JSX.
 *
 * Two of the day's units stand on their own and are ticked one at a time: an **exchange** (anchored
 * to an urge) and a plain **habit** with no stack (anchored to nothing in particular). They wear the
 * same bar, the same ring and the same `⋯` management door — so they share this contract type and
 * the component that paints it ({@link import('@/components/loose-row').LooseRow}).
 *
 * What they do NOT share is the wording, and that is deliberate: an exchange is *held* (a claim
 * about a routine you displaced), a habit is *done*. Each has its own contract function so the
 * words live next to the reasoning for them, and each is testable on its own — jest here matches
 * `src/**\/*.test.ts` only, so a row's state matrix would otherwise have no test at all.
 */

import { countGoalLabel } from '@/lib/count-goal';
import { describeHijriSchedule, describeWeekdays, type HijriSchedule } from '@/lib/dates';

/** The resolved state of a stackless row — everything the bar needs to paint and to announce. */
export type LooseRowContract = {
  mode:
    /** In play today and not yet ticked — the tap commits. */
    | 'open'
    /** Ticked today; the tap takes it back. */
    | 'held'
    /** Excused for the viewed day. Nothing to assert, so the row is inert. */
    | 'excused';
  /** The row responds to a tap at all. `false` ⟹ render it with no ripple and no underlay:
   *  a press feedback the row can't honour is a promise it can't keep. */
  enabled: boolean;
  /** Always a checkbox — the row *is* the control. */
  role: 'checkbox';
  checked: boolean;
  /** The visible first line — the name, exactly as stored. Kept apart from {@link label}: the
   *  spoken form folds the meta into one sentence, and deriving one from the other would break on
   *  the first name containing a comma. */
  title: string;
  /** The spoken form — the whole row as one sentence, for a screen reader. */
  label: string;
  hint: string;
  /** The optional second line: what an exchange displaces, or what a habit is asking for (see
   *  {@link habitMetaLine}). Empty when the name is the whole of it. */
  meta: string;
  /** A count goal partway to its target: how much of the ring to draw. Absent otherwise. */
  fraction?: number;
};

/**
 * A habit's second line — what the day is asking for beyond the name: its count goal, its schedule,
 * or both, joined by the middot the rows use everywhere else ("3 pages · Mon · Wed · Fri").
 *
 * **"Every day" is omitted on purpose.** It is the default and the overwhelming majority, so a line
 * carrying it says nothing while costing every row a second line — and a caption that is always
 * there is one people stop reading, which spends the slot that the *exceptions* need. A Hijri
 * schedule always shows: it is never the default, and it is the one thing about such a habit you
 * cannot infer from seeing it on today's list.
 *
 * (`describeWeekdays` also has a `'No days'` case. It can't reach a row — `scheduledOn` keeps such
 * a habit off every day — but it is passed through rather than special-cased, so if one ever does
 * appear the row says so instead of looking like an ordinary daily habit.)
 *
 * This used to be behind the row's fold. The fold is gone: one grey line and a menu door was not
 * worth a disclosure, and the schedule reads better where it can be scanned down the column with
 * the names it belongs to.
 */
export function habitMetaLine({
  targetCount,
  targetUnit,
  scheduleDays,
  hijriSchedule,
  count = 0,
  done = false,
}: {
  targetCount: number | null;
  targetUnit: string | null;
  scheduleDays: number[];
  hijriSchedule: HijriSchedule | null;
  /** The viewed day's logged count, so a count goal partway reads "3 of 8 cups". */
  count?: number;
  done?: boolean;
}): string {
  const goal = targetCount ? countGoalLabel(targetCount, targetUnit, count, done) : '';
  const schedule = hijriSchedule ? describeHijriSchedule(hijriSchedule) : describeWeekdays(scheduleDays);
  const when = schedule === 'Every day' ? '' : schedule;
  return [goal, when].filter(Boolean).join(' · ');
}

/**
 * A habit that belongs to no stack — the ordinary case, and (since 2026-08-09) a first-class one.
 *
 * It is ticked on its own because there is no seal to carry it: a stack is one performance and its
 * acts are read rather than ticked, but nothing groups this, so the row is the control. The words
 * are plainer than an exchange's for the same reason the thing is — no displaced routine to name,
 * no claim beyond the deed.
 */
export function habitRowContract({
  name,
  meta,
  done,
  skipped,
  count,
}: {
  name: string;
  /** The second line, from {@link habitMetaLine} — a goal, a schedule, both, or empty. */
  meta: string;
  done: boolean;
  /** A count goal's day so far, `{ count, target }`; absent on a binary habit. */
  count?: { count: number; target: number };
  /** Excused for the viewed day. Outranks `done`: an excused row can't also be asserting. */
  skipped: boolean;
}): LooseRowContract {
  // Spoken and seen must match — a screen reader hearing something that isn't on screen is being
  // read a different row than the one under the finger.
  const spoken = meta ? `${name}, ${meta}` : name;

  if (skipped) {
    return {
      mode: 'excused',
      enabled: false,
      role: 'checkbox',
      checked: false,
      title: name,
      label: `${spoken}, excused today`,
      // A statement rather than an instruction: activating this row does nothing at all, and a
      // hint that described an action would be describing the `⋯` beside it instead.
      hint: 'Excused for today. Nothing to record.',
      meta,
    };
  }

  return {
    mode: done ? 'held' : 'open',
    enabled: true,
    role: 'checkbox',
    checked: done,
    title: name,
    // No ", done" here: that state is carried by `checked` on this same element, and saying it
    // twice is exactly what the stack header's label was cleaned up to stop doing.
    label: spoken,
    hint: done ? 'Clears it for today.' : count ? 'Counts one.' : 'Marks it done for today.',
    meta,
    fraction: count && !done && count.target > 0 ? count.count / count.target : undefined,
  };
}
