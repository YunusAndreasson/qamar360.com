import { memo } from 'react';

import { LooseRow } from '@/components/loose-row';
import type { Habit } from '@/hooks/use-habits';
import { exchangeRowContract } from '@/lib/exchange';

type Props = {
  habit: Habit;
  /** Held for the viewed day — the deed happened. */
  held: boolean;
  /** Excused for the viewed day: out of the rate entirely, and the row goes inert. */
  skipped: boolean;
  /** The viewed day's completions are being (re)fetched after a day-step. */
  settling: boolean;
  /** Hold it, or take it back. */
  onToggle: (habit: Habit) => void;
  /** Open the exchange sheet — skip today, insights, edit, delete. */
  onOptions: (habit: Habit) => void;
};

/**
 * One exchange: a deed you claim in the place an old routine keeps taking.
 *
 * The row's shape — bar, ring, the `⋯` door — is {@link LooseRow}, shared with the plain stackless
 * habit above it in the day. What belongs to *this* feature is the wording:
 *
 * - What the tick asserts is the deed in the title — **never** the absence of the routine below it.
 *   That is the whole mechanism, not a wording preference: a plan phrased as "don't" keeps the old
 *   routine primed and measurably strengthens it, while one phrased as "this instead" displaces it.
 * - The second line is what it stands in for ("instead of soft drinks"), and stops there. The
 *   **cue** is not on the day's row at all — it is read where the plan is *made* (the library card
 *   you choose from, the editor's WHEN field, and `⋯ → Edit exchange`), because by the time a row
 *   is on your day the moment is settled and a third line restating it every evening is a rehearsal
 *   nobody asked for. It briefly lived behind a fold here; a disclosure whose whole payload was one
 *   grey line and a menu door was not worth the chevron it promised content with.
 */
function ExchangeRowBase({ habit, held, skipped, settling, onToggle, onOptions }: Props) {
  return (
    <LooseRow
      contract={exchangeRowContract({ name: habit.name, insteadOf: habit.instead_of ?? '', held, skipped })}
      settling={settling}
      onToggle={() => onToggle(habit)}
      options={{
        accessibilityLabel: `Manage ${habit.name} exchange`,
        accessibilityHint: 'Skip today, see insights, edit, or delete the exchange.',
        onPress: () => onOptions(habit),
      }}
    />
  );
}

// Memoized on what the row paints. A drag-reorder anywhere in the day re-stamps `position` into a
// fresh object on EVERY habit, exchanges included — a field this row never renders — so a default
// identity compare would rebuild the whole section on the frame a drop commits (the same trap
// documented on ActRow). Keep in sync if the row starts rendering another `habit` field.
function exchangePropsEqual(a: Props, b: Props): boolean {
  return (
    a.habit.id === b.habit.id &&
    a.habit.name === b.habit.name &&
    a.habit.instead_of === b.habit.instead_of &&
    a.held === b.held &&
    a.skipped === b.skipped &&
    a.settling === b.settling &&
    a.onToggle === b.onToggle &&
    a.onOptions === b.onOptions
  );
}

export const ExchangeRow = memo(ExchangeRowBase, exchangePropsEqual);
