import { memo } from 'react';

import { LooseRow, LooseRowDetail } from '@/components/loose-row';
import { RowSeparator } from '@/components/row-separator';
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
  expanded: boolean;
  onSetExpanded: (habitId: string, expanded: boolean) => void;
};

/**
 * One exchange: a deed you claim in the place an old routine keeps taking.
 *
 * The row's shape — bar, ring, fold, management door — is {@link LooseRow}, shared with the plain
 * stackless habit above it in the day. What belongs to *this* feature is the wording and what the
 * fold reveals:
 *
 * - What the tick asserts is the deed in the title — **never** the absence of the routine below it.
 *   That is the whole mechanism, not a wording preference: a plan phrased as "don't" keeps the old
 *   routine primed and measurably strengthens it, while one phrased as "this instead" displaces it.
 * - The fold reads the **cue**, which the collapsed row deliberately never shows (see
 *   `ExchangeRowContract`: the moment is read where the plan is made, not every evening where it is
 *   kept). A fold is precisely the place for something you go looking for rather than are shown.
 */
function ExchangeRowBase({ habit, held, skipped, settling, onToggle, onOptions, expanded, onSetExpanded }: Props) {
  return (
    <LooseRow
      contract={exchangeRowContract({ name: habit.name, insteadOf: habit.instead_of ?? '', held, skipped })}
      settling={settling}
      onToggle={() => onToggle(habit)}
      expanded={expanded}
      onToggleFold={() => onSetExpanded(habit.id, !expanded)}
      foldLabel={`${habit.name} plan`}
      foldHint={expanded ? 'Collapses the exchange.' : 'Expands the exchange to read its plan.'}
      manage={{
        label: 'Manage exchange',
        accessibilityLabel: `Manage ${habit.name} exchange`,
        accessibilityHint: 'Skip today, see insights, edit, or delete the exchange.',
        onPress: () => onOptions(habit),
      }}>
      {/* The moment the plan names. Rows created before the form required a cue simply have no
          second half, and the fold then holds the management door alone — which is still worth
          opening, and is why the chevron isn't conditional on having one. */}
      {habit.cue ? (
        <>
          <LooseRowDetail text={habit.cue} />
          <RowSeparator />
        </>
      ) : null}
    </LooseRow>
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
    a.habit.cue === b.habit.cue &&
    a.held === b.held &&
    a.skipped === b.skipped &&
    a.settling === b.settling &&
    a.expanded === b.expanded &&
    a.onToggle === b.onToggle &&
    a.onOptions === b.onOptions &&
    a.onSetExpanded === b.onSetExpanded
  );
}

export const ExchangeRow = memo(ExchangeRowBase, exchangePropsEqual);
