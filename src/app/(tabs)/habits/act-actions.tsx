import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive } from '@/lib/alerts';
import { dayInSentence } from '@/lib/dates';
import { isExchange } from '@/lib/exchange';
import { haptics } from '@/lib/haptics';

/**
 * One act's options — the sheet a row's `⋯` raises.
 *
 * A tap on the row ticks it; everything else you might want from a single habit lives here:
 * excusing it on a day it doesn't apply — so an unavoidable miss doesn't cost the whole stack —
 * plus its stats, its settings, and where it lives.
 *
 * Presented `fitToContents` from the habits stack layout, the same compact sheet-of-rows as
 * "Manage stack".
 *
 * The same sheet serves all three of the things a habit row can be, because they want the same
 * answers — only the noun changes (act / habit / exchange, see below). An *exchange* loses one row:
 * it is anchored to an urge rather than to a moment, so it belongs to no stack and there is nowhere
 * to move it to. A stackless *habit* keeps that row, phrased as moving to *a* stack rather than
 * another one — that is the anchoring offer, now that it is a thing you do to a habit rather than
 * the reason it is on screen.
 */
export default function ActActionsScreen() {
  const router = useRouter();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { habits, skipped, skipHabit, deleteHabit, today, viewDate } = useHabits();

  const habit = habits.find((h) => h.id === habitId) ?? null;

  // An act deleted (here or elsewhere) while the sheet is up has nothing left to act on. `habit`
  // is narrowed non-null for the rest of the component from here on.
  useBackIfStale(!!habitId && !habit);
  if (!habit) return null;

  const isSkipped = skipped.has(habit.id);
  const exchange = isExchange(habit);
  // One word per thing, wherever the user reads it. Inside a stack it is an **act** — one deed of a
  // sequence. Standing on its own it is a **habit**, which is what the section it sits in is called
  // and what the row's own "Manage habit" promised. An exchange is neither.
  const noun = exchange ? 'exchange' : habit.stack_id ? 'act' : 'habit';

  const toggleSkip = () => {
    void skipHabit(habit.id);
    router.back();
  };

  // `replace` (not push) so the next modal's Save/Close returns to Today, not back to this sheet.
  const openStats = () => {
    router.replace({ pathname: '/habits/stats', params: { habitId: habit.id } });
  };

  const edit = () => {
    router.replace({ pathname: exchange ? '/habits/exchange' : '/habits/editor', params: { id: habit.id } });
  };

  const moveTo = () => {
    router.replace({ pathname: '/habits/add-to-stack', params: { habitId: habit.id } });
  };

  const confirmDelete = () => {
    // Deleting drops the habit from state; the effect above backs the sheet out (don't also
    // router.back() here, or it pops twice).
    confirmDestructive({
      title: `Delete ${noun}`,
      message: `Delete “${habit.name}”? Its history goes with it.`,
      onConfirm: () => {
        haptics.removed();
        void deleteHabit(habit.id);
      },
    });
  };

  return (
    <FormSheet title={habit.name} subtitle={noun.charAt(0).toUpperCase() + noun.slice(1)}>
      <SheetActions
        actions={[
          {
            // "Today" only when it is: on a backfilled day the row has to name the day it excuses.
            icon: 'skip',
            label: isSkipped ? 'Un-skip' : `Skip ${dayInSentence(viewDate, today)}`,
            sublabel: isSkipped
              ? habit.stack_id
                ? 'Put it back in the sequence'
                : 'Put it back in the day'
              : 'Excused, so it won’t count against you',
            onPress: toggleSkip,
          },
          { icon: 'stats', label: 'Stats', onPress: openStats },
          { icon: 'edit', label: `Edit ${noun}`, onPress: edit },
          // An exchange has no stack to move between — its anchor is the urge, not a moment. A
          // habit that has none yet is moving to *a* stack, not to another one.
          exchange
            ? null
            : {
                icon: 'addLink',
                label: habit.stack_id ? 'Move to another stack' : 'Move to a stack',
                onPress: moveTo,
              },
          { icon: 'delete', label: `Delete ${noun}`, danger: true, onPress: confirmDelete },
        ]}
      />
    </FormSheet>
  );
}
