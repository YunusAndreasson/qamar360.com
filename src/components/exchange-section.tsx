import { memo } from 'react';

import { CardSection } from '@/components/card-section';
import { ExchangeRow } from '@/components/exchange-row';
import type { Habit } from '@/hooks/use-habits';

type Props = {
  /** The day's exchanges, in position order. */
  exchanges: Habit[];
  /** Space above the caption — the screen owns it, so the day's sections break on one rhythm. */
  topGap: number;
  completed: Set<string>;
  skipped: Set<string>;
  /** The viewed day's completions are being (re)fetched after a day-step — see `CompletionRing`'s
   *  `settling` doc. Passed straight through to the rows, which persist across a day-step (they are
   *  keyed by habit, not by day) and would otherwise replay their sweep as the data lands. */
  settling: boolean;
  onToggle: (habit: Habit) => void;
  onOptions: (habit: Habit) => void;
};

/**
 * The day's exchanges, below the stacks.
 *
 * Below, and not among them, because they are anchored to different things. A stack hangs off a
 * deed with a definite finish — after Fajr, after getting into bed — and therefore has a place in
 * the day's order. An exchange hangs off an urge, which arrives unannounced and could arrive
 * three times before noon; it has no slot to occupy, so it keeps its own ground at the foot of
 * the day where the reckoning happens.
 *
 * One grouped card, not a card each: the exchanges are read together, and separate cards would
 * make three small commitments look like three more stacks. Nothing renders at all when there are
 * none — the section is not an empty state waiting to be filled, and the way in is the "+" menu.
 *
 * A fixed block of bars: the rows briefly folded, like the stack cards above them, but what they
 * opened onto did not justify the chevron (see {@link ExchangeRow}). Each row's `⋯` goes straight
 * to the sheet instead.
 */
function ExchangeSectionBase({ exchanges, topGap, completed, skipped, settling, onToggle, onOptions }: Props) {
  if (exchanges.length === 0) return null;

  return (
    // Named for the unit, like `STACKS` and `TO DO` beside it — not "INSTEAD OF", which this label
    // used to read. That phrase is the editor's field for the routine being displaced ("soft
    // drinks"), and using it here made one wording mean the whole feature on the day and one field
    // of one item in the editor. Every other way in — the "+" menu, the act sheet, the library,
    // the guide — already says exchange; the day was the last screen that didn't.
    <CardSection label="EXCHANGES" topGap={topGap}>
      {exchanges.map((habit) => (
        <ExchangeRow
          key={habit.id}
          habit={habit}
          held={completed.has(habit.id)}
          skipped={skipped.has(habit.id)}
          settling={settling}
          onToggle={onToggle}
          onOptions={onOptions}
        />
      ))}
    </CardSection>
  );
}

/** Set identity changes for every Today completion; only membership for these exchanges matters. */
export const ExchangeSection = memo(ExchangeSectionBase, (prev, next) => {
  if (
    prev.exchanges !== next.exchanges ||
    prev.topGap !== next.topGap ||
    prev.settling !== next.settling ||
    prev.onToggle !== next.onToggle ||
    prev.onOptions !== next.onOptions
  ) {
    return false;
  }
  return next.exchanges.every(
    (exchange) =>
      prev.completed.has(exchange.id) === next.completed.has(exchange.id) &&
      prev.skipped.has(exchange.id) === next.skipped.has(exchange.id),
  );
});
