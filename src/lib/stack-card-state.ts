/**
 * What a stack card's header says and does — resolved once, as data, so the card can render it
 * without re-deriving a tri-state in JSX.
 *
 * The header is the card's completion control: tapping it seals the whole stack, tapping a sealed
 * one re-opens it. But two stacks can't be sealed — one with no acts yet (it invites instead), and
 * one whose every act is excused today (it would write nothing, so it must not offer). That
 * three-way split, crossed with sealed and folded, is exactly the kind of matrix that regresses
 * silently in a component, and no component test can exist here (jest matches `*.test.ts` only) —
 * so it lives out here as pure logic, the way {@link isStackComplete} already backs the card's
 * sealed look.
 */

type StackHeaderMode =
  /** The normal case: the header commits (or un-commits) the group. */
  | 'seal'
  /** Every act excused today — nothing to assert, so the header is inert. */
  | 'excused'
  /** A brand-new stack with no acts: the header leads to the same place its body row does. */
  | 'add';

export type StackHeaderContract = {
  mode: StackHeaderMode;
  /** The header responds to a tap at all. `false` ⟹ render it with no ripple and no highlight:
   *  a press feedback the header can't honour is a promise it can't keep. */
  enabled: boolean;
  /** A header that seals is a toggle over a binary state, so it announces as a checkbox and
   *  carries `checked`. The empty card's header only navigates — a plain button. */
  role: 'checkbox' | 'button';
  /** Sealed-ness, for `accessibilityState`. Absent on the empty card, which has no such state. */
  checked?: boolean;
  label: string;
  hint: string;
};

function acts(n: number): string {
  return `${n} act${n === 1 ? '' : 's'}`;
}

export function stackHeaderContract({
  name,
  memberCount,
  openCount,
  sealed,
  lit,
  until,
}: {
  name: string;
  /** Every act the stack holds for the viewed day, excused ones included — what the fold hides. */
  memberCount: number;
  /** The acts actually in play today (excused ones dropped) — what a seal would assert. */
  openCount: number;
  sealed: boolean;
  /** This stack's moment is the current one — the header carries its clock. */
  lit: boolean;
  /** Preformatted closing time of the lit band ("9:47 PM"). Sky moments only. */
  until?: string;
}): StackHeaderContract {
  if (memberCount === 0) {
    return {
      mode: 'add',
      enabled: true,
      role: 'button',
      // No "hold and drag" clause: the empty card is the one entry the grid won't lift
      // (`draggable={members.length > 0}`), so offering the gesture would be a lie.
      label: `${name} stack, empty`,
      hint: 'Activates to add its first act.',
    };
  }

  // Why this card carries a clock, said in words. A sealed stack never does (the recede outranks
  // the deadline), so in practice this clause and a `checked` header don't co-occur — but the
  // contract simply reports what it's given.
  const moment = lit ? `, current time of day${until ? ` until ${until}` : ''}` : '';

  if (openCount === 0) {
    return {
      mode: 'excused',
      enabled: false,
      role: 'checkbox',
      checked: false,
      label: `${name} stack${moment}, ${acts(memberCount)}, every act excused today`,
      hint: 'Hold and drag to reorder it.',
    };
  }

  return {
    mode: 'seal',
    enabled: true,
    role: 'checkbox',
    checked: sealed,
    // Neither ", sealed" nor ", collapsed" belongs here any more: sealed-ness is carried by
    // `checked` on this element and folded-ness by `expanded` on the chevron beside it. Saying
    // either in the label too would have a screen reader announce the state twice.
    label: `${name} stack${moment}, ${acts(openCount)}`,
    hint: sealed
      ? 'Re-opens the stack for today. Hold and drag to reorder it.'
      : `Marks all ${acts(openCount)} done for today. Hold and drag to reorder it.`,
  };
}
