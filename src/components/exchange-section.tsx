import { StyleSheet, View } from 'react-native';

import { ExchangeRow } from '@/components/exchange-row';
import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { Surface } from '@/components/surface';
import { Spacing } from '@/constants/theme';
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
  /** Which rows are unfolded, and how to fold them — the screen's store, shared with the stack
   *  cards so the day has one notion of what is open (and one that resets with the viewed day). */
  expandedIds: ReadonlySet<string>;
  onSetExpanded: (habitId: string, expanded: boolean) => void;
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
 * The rows fold, like the stack cards above them — so this Surface behaves as an accordion of bars
 * rather than a fixed block, and a row's revealed body sits between its own bar and the next row's
 * separator.
 */
export function ExchangeSection({
  exchanges,
  topGap,
  completed,
  skipped,
  settling,
  onToggle,
  onOptions,
  expandedIds,
  onSetExpanded,
}: Props) {
  if (exchanges.length === 0) return null;

  return (
    <View style={[styles.section, { paddingTop: topGap }]}>
      {/* Named for the unit, like `STACKS` and `TO DO` beside it — not "INSTEAD OF", which this
          label used to read. That phrase is the editor's field for the routine being displaced
          ("soft drinks"), and using it here made one wording mean the whole feature on the day and
          one field of one item in the editor. Every other way in — the "+" menu, the act sheet, the
          library, the guide — already says exchange; the day was the last screen that didn't. */}
      <SectionLabel>EXCHANGES</SectionLabel>
      <Surface>
        {exchanges.map((habit, i) => (
          <View key={habit.id}>
            {i > 0 ? <RowSeparator /> : null}
            <ExchangeRow
              habit={habit}
              held={completed.has(habit.id)}
              skipped={skipped.has(habit.id)}
              settling={settling}
              onToggle={onToggle}
              onOptions={onOptions}
              expanded={expandedIds.has(habit.id)}
              onSetExpanded={onSetExpanded}
            />
          </View>
        ))}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  // The same 16pt horizontal inset `DragGrid` gives the stack cards — this section sits outside
  // the drag layer, so it has to reproduce the alignment rather than inherit it, or the card edges
  // would step in and out down the day. Top space comes from the screen (`topGap`): the break
  // between two units is one number, and only the screen knows what this section follows.
  section: { gap: Spacing.two, paddingHorizontal: Spacing.three },
});
