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
 * and per-habit Insights all keep working untouched. `instead_of` being non-null *is* what makes a
 * habit an exchange; `stack_id` stays null, because an exchange is anchored to an urge rather than
 * to a moment of the day.
 *
 * This module is pure so it can be tested: jest here matches `src/**\/*.test.ts` only, so a row's
 * state matrix would otherwise have no test at all — the same reason
 * {@link stackHeaderContract} lives outside `StackCard`.
 */

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

export type ExchangeRowContract = {
  mode:
    /** In play today and not yet held — the tap commits. */
    | 'open'
    /** Held today; the tap takes it back. */
    | 'held'
    /** Excused for the viewed day. Nothing to assert, so the row is inert. */
    | 'excused';
  /** The row responds to a tap at all. `false` ⟹ render it with no ripple and no underlay:
   *  a press feedback the row can't honour is a promise it can't keep. */
  enabled: boolean;
  /** Always a checkbox — the row *is* the control, the way a stack card's header is. */
  role: 'checkbox';
  checked: boolean;
  label: string;
  hint: string;
  /** The second line: what this displaces, and the moment it hits. */
  meta: string;
};

export function exchangeRowContract({
  name,
  insteadOf,
  cue,
  held,
  skipped,
}: {
  /** The deed, past tense and first person, as it is read at the moment of ticking. */
  name: string;
  /** The displaced routine, stored mid-sentence ("soft drinks") so it reads after "Instead of". */
  insteadOf: string;
  /** The situation that fires the urge ("when I sit down to eat"). Absent on older rows. */
  cue?: string | null;
  held: boolean;
  /** Excused for the viewed day. Outranks `held`: an excused row can't also be asserting. */
  skipped: boolean;
}): ExchangeRowContract {
  // The displaced routine and the moment it arrives, in that order. **No "Instead of " prefix**
  // (dropped 2026-08-05): the section caption above the card is literally INSTEAD OF, so every row
  // was restating its own heading — and the three wasted words pushed a plain pairing onto a
  // second line. The visible line is a fragment; the spoken one below stays a sentence. A row with
  // no cue simply says less rather than inventing one — the form requires a cue, but rows created
  // before it did, or edited around it, must still read.
  const meta = `${insteadOf}${cue ? ` · ${cue}` : ''}`;
  // Read as one sentence: the deed, then what it replaces, then when. Commas, not the middle
  // dot — a screen reader pauses on a comma and says nothing useful for "·".
  const spoken = `${name}, instead of ${insteadOf}${cue ? `, ${cue}` : ''}`;

  if (skipped) {
    return {
      mode: 'excused',
      enabled: false,
      role: 'checkbox',
      checked: false,
      label: `${spoken}, excused today`,
      // A statement rather than an instruction: activating this row does nothing at all, and a
      // hint that described an action would be describing the ⋯ button beside it instead.
      hint: 'Excused for today — nothing to record.',
      meta,
    };
  }

  return {
    mode: held ? 'held' : 'open',
    enabled: true,
    role: 'checkbox',
    checked: held,
    // No ", held" here: that state is carried by `checked` on this same element, and saying it
    // twice is exactly what the stack header's label was cleaned up to stop doing.
    label: spoken,
    // "Held", never "avoided" or "resisted" — the claim is that the good deed happened, which is
    // the only thing this row records. Un-holding is phrased as a correction, not a confession.
    hint: held ? 'Clears it for today.' : 'Marks it held for today.',
    meta,
  };
}
