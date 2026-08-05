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
  completed: Set<string>;
  skipped: Set<string>;
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
 */
export function ExchangeSection({ exchanges, completed, skipped, onToggle, onOptions }: Props) {
  if (exchanges.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionLabel>INSTEAD OF</SectionLabel>
      <Surface>
        {exchanges.map((habit, i) => (
          <View key={habit.id}>
            {i > 0 ? <RowSeparator /> : null}
            <ExchangeRow
              habit={habit}
              held={completed.has(habit.id)}
              skipped={skipped.has(habit.id)}
              onToggle={onToggle}
              onOptions={onOptions}
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
  // would step in and out down the day.
  //
  // 32 above it: the widest step in the app's 8/16/32 whitespace scale, because this is a bigger
  // break than the 16pt one between the almanac and the list. What follows is not another card in
  // the same sequence but a different unit of tracking, with its own caption.
  section: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.five },
});
