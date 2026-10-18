/**
 * What a stack card's header says and does, resolved once as data so the card can render it
 * without re-deriving a tri-state in JSX.
 *
 * The header opens and closes the card. It used to seal the whole stack in one tap, and a tap on a
 * sealed one deleted the day's record for every act in it, including acts ticked one by one, with
 * no confirm and no undo. Once acts became tickable (2026-09-08) that made two controls for one
 * job, and the larger one was the destructive one. Now the acts are the only completion control:
 * the last tick keeps the stack, and the header is a gauge (its ring) plus the door to the
 * sequence. A stack with no acts yet has nothing to open, so its header leads to adding one.
 *
 * No component test can exist here (jest matches `*.test.ts` only), so this lives out here as pure
 * logic, the way {@link isStackComplete} already backs the card's sealed look.
 */

type StackHeaderMode =
  /** The normal case: the header opens and closes the card's sequence. */
  | 'fold'
  /** A brand-new stack with no acts: the header leads to the same place its body row does. */
  | 'add';

export type StackHeaderContract = {
  mode: StackHeaderMode;
  label: string;
  hint: string;
  /**
   * The card's visible sub-line: how long the sequence is, and (once any of it is done) how far
   * through it you are. Silent at zero: "0 of 3" is the empty ring restated, and a day of untouched
   * stacks should read as names, not as zeroes. A day that excuses every act says so instead.
   */
  summary: string;
};

function acts(n: number): string {
  return `${n} act${n === 1 ? '' : 's'}`;
}

export function stackHeaderContract({
  name,
  memberCount,
  openCount,
  doneCount = 0,
  expanded = false,
}: {
  name: string;
  /** Every act the stack holds for the viewed day, excused ones included: what the fold hides. */
  memberCount: number;
  /** The acts actually in play today (excused ones dropped). */
  openCount: number;
  /** How many of those are already ticked. */
  doneCount?: number;
  /** The card is open, so the header's tap would close it. */
  expanded?: boolean;
}): StackHeaderContract {
  if (memberCount === 0) {
    return {
      mode: 'add',
      // No "hold and drag" clause: the empty card is the one entry the grid won't lift
      // (`draggable={members.length > 0}`), so offering the gesture would be a lie.
      label: `${name} stack, empty`,
      hint: 'Activates to add its first act.',
      // The body row below already offers "Add your first act"; the sub-line only has to
      // say what the fold would hide, which on this card is nothing.
      summary: 'No acts yet',
    };
  }

  const summary =
    openCount === 0
      ? 'Every act excused today'
      : doneCount > 0
        ? `${doneCount} of ${acts(openCount)} done`
        : acts(openCount);

  return {
    mode: 'fold',
    // The open/closed state is carried by `expanded` on this element, so the label never says it.
    label: `${name} stack, ${openCount === 0 ? `${acts(memberCount)}, every act excused today` : summary}`,
    hint: `${expanded ? 'Hides its acts.' : 'Shows its acts.'} Hold and drag to reorder it.`,
    summary,
  };
}
