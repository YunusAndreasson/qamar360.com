/**
 * Exchanges — a good act put where an old routine keeps happening.
 *
 * A stack answers "what should I add?" by hanging a sequence on a cue the day already contains.
 * This answers the other half: an urge arrives, and the plan is to meet it with something else.
 *
 * The shape is not a matter of taste. Implementation intentions — "if [situation], then I will
 * [act]" — are among the best-replicated tools in behaviour change, but the *negation* form ("if
 * X, then I will NOT do Y") reliably backfires: naming the routine keeps it primed, and Adriaanse
 * et al. measured unhealthy snacking going **up** under it. The replacement form works because it
 * does two things at once — it strengthens the situation→good-act link and weakens the
 * situation→old-routine one. So the app has no "don't" field anywhere: what is stored, ticked and
 * counted is the deed, and the displaced routine is context beside it.
 *
 * Storage follows from that. An exchange is an ordinary `habits` row with two extra columns, so a
 * tick is an ordinary `habit_completions` row and degrees, the month ring, the year trend, streaks
 * and per-habit Stats all keep working untouched. `instead_of` being non-null *is* what makes a
 * habit an exchange; `stack_id` stays null, because an exchange is anchored to an urge rather than
 * to a moment of the day.
 *
 * This module is pure so it can be tested: jest here matches `src/**\/*.test.ts` only, so a row's
 * state matrix would otherwise have no test at all — the same reason
 * {@link stackHeaderContract} lives outside `StackCard`.
 */

import type { LooseRowContract } from '@/lib/loose-row';

/** The only field the discriminator needs — `Habit` satisfies it structurally. */
export type Exchangeable = { instead_of: string | null };

/**
 * Is this habit an exchange rather than an ordinary act? Empty counts as absent: a blank
 * `instead_of` displaces nothing, and a row that claimed to be an exchange without naming what it
 * replaces would render a meta line reading "Instead of ".
 */
export function isExchange(habit: Exchangeable): boolean {
  return !!habit.instead_of;
}

/**
 * The plan under an exchange's name: what is being displaced, and — where there is room to decide
 * rather than merely tick — the moment it arrives: "instead of soft drinks · sitting down to eat".
 *
 * The cue is optional at the call site, and that is the whole point of the parameter. The library
 * card passes it (you are choosing, so the moment matters); the day's row does not (you already
 * chose). See {@link ExchangeRowContract} for why the row stops at two lines.
 *
 * Lowercase and unpunctuated because it is not a label but the second half of a sentence the title
 * begins: *Drank a glass of water* / *instead of soft drinks*. That makes the visible line and the
 * spoken one the same sentence, and it is why the words are here rather than in a caption.
 *
 * They were dropped on 2026-08-05 as clutter, on the grounds that the section above the card was
 * captioned INSTEAD OF and every row was restating its own heading. That caption is now EXCHANGES —
 * named for its unit, like STACKS and TO DO beside it — so the preposition has nowhere else to live,
 * and a bare "soft drinks · when I sit down to eat" no longer says what soft drinks *is*.
 *
 * One definition, used by the day's row and the library's card, which previously carried the same
 * template twice with a comment on one asking that it match the other.
 */
export function exchangePlanLine(insteadOf: string, cue?: string | null): string {
  // A row with no cue simply says less rather than inventing one — the form requires a cue, but
  // rows created before it did, or edited around it, must still read.
  return `instead of ${insteadOf}${cue ? ` · ${cue}` : ''}`;
}

/**
 * Why the day's row does not show the cue *until you ask for it*.
 *
 * The moment is what makes an exchange a plan, and it is read where the plan is *made* — the
 * library card you choose from, and the editor's WHEN field. It is not read where the plan is
 * *kept*. By the time a row is on your day you have already decided when this happens; a third
 * line restating it every evening is a rehearsal nobody asked for, on the one screen that gets
 * looked at tired. So the row is two lines and stops: the deed, and what it stands in for.
 *
 *     Chose water
 *     instead of soft drinks
 *
 * That shape is the day's, not this feature's — it is the same two-line grammar a stack card's
 * header uses, which is why an exchange can sit under the stacks without announcing itself as a
 * different kind of thing.
 *
 * The cue is reachable from the day, at `⋯ → Edit exchange` — where the plan is made, which is the
 * point of the rule rather than an exception to it. It briefly had a home behind a fold on this
 * row. That was a mistake worth recording: a chevron promises content, and what it opened onto was
 * one grey line — or, for the rows that predate the required cue, nothing at all but the manage
 * door. The chevron is now the stack card's alone, and it means what it says.
 *
 * The shape itself is {@link LooseRowContract}, shared with the plain stackless habit beside it —
 * the two rows are one component. Only the *words* are this feature's: an exchange is **held**,
 * a habit is **done**.
 */
export type ExchangeRowContract = LooseRowContract;

/** Note the cue is absent from every field here: the row's text, and its spoken label, are the
 *  same two lines. */
export function exchangeRowContract({
  name,
  insteadOf,
  held,
  skipped,
}: {
  /** The deed, past tense and first person, as it is read at the moment of ticking. */
  name: string;
  /** The displaced routine, stored mid-sentence ("soft drinks") so it reads after "Instead of". */
  insteadOf: string;
  held: boolean;
  /** Excused for the viewed day. Outranks `held`: an excused row can't also be asserting. */
  skipped: boolean;
}): ExchangeRowContract {
  // No cue: the row is the deed and what it displaces, nothing else (see the type's note).
  const meta = exchangePlanLine(insteadOf);
  // The same sentence as the visible line, punctuated for the ear: the deed, then what it replaces.
  // Spoken and seen must match — a screen reader hearing a moment that isn't on screen is being
  // read a different row than the one under the finger.
  const spoken = `${name}, instead of ${insteadOf}`;

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
      hint: 'Excused for today — nothing to record.',
      meta,
    };
  }

  return {
    mode: held ? 'held' : 'open',
    enabled: true,
    role: 'checkbox',
    checked: held,
    title: name,
    // No ", held" here: that state is carried by `checked` on this same element, and saying it
    // twice is exactly what the stack header's label was cleaned up to stop doing.
    label: spoken,
    // "Held", never "avoided" or "resisted" — the claim is that the good deed happened, which is
    // the only thing this row records. Un-holding is phrased as a correction, not a confession.
    hint: held ? 'Clears it for today.' : 'Marks it held for today.',
    meta,
  };
}
