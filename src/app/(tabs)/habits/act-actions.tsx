import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormSheet, SheetRow } from '@/components/form-sheet';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive } from '@/lib/alerts';
import { isExchange } from '@/lib/exchange';
import { haptics } from '@/lib/haptics';

/**
 * One act's options — the sheet a tap on an act line raises.
 *
 * Acts are read, not ticked (the stack's seal is the only completion control), so a tap has to
 * mean *inspect* instead. Everything you might want from a single act lives here: excusing it on
 * a day it doesn't apply — the one escape hatch the stack-only model needs, so an unavoidable
 * miss doesn't cost the whole stack — plus its history, its settings, and where it lives.
 *
 * Presented `fitToContents` from the habits stack layout, the same compact sheet-of-rows as
 * "Manage stack".
 *
 * The same sheet serves an *exchange*, minus one row: an exchange is anchored to an urge rather
 * than to a moment, so it belongs to no stack and there is nowhere to move it to. Everything else
 * it needs is already here, so it would be a second sheet saying the same things.
 */
export default function ActActionsScreen() {
  const router = useRouter();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { habits, skipped, skipHabit, deleteHabit, isToday, viewDate } = useHabits();

  const habit = habits.find((h) => h.id === habitId) ?? null;

  // An act deleted (here or elsewhere) while the sheet is up has nothing left to act on. `habit`
  // is narrowed non-null for the rest of the component from here on.
  useBackIfStale(!!habitId && !habit);
  if (!habit) return null;

  const isSkipped = skipped.has(habit.id);
  const exchange = isExchange(habit);
  const noun = exchange ? 'exchange' : 'act';

  const toggleSkip = () => {
    void skipHabit(habit.id);
    router.back();
  };

  // `replace` (not push) so the next modal's Save/Close returns to Today, not back to this sheet.
  const openInsights = () => {
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
    <FormSheet title={habit.name} subtitle={exchange ? 'Exchange' : 'Act'}>
      <Surface>
        {/* "Today" only when it is: on a backfilled day the row has to name the day it excuses. */}
        <SheetRow
          icon="skip"
          label={isSkipped ? 'Un-skip' : isToday ? 'Skip today' : `Skip ${viewDate}`}
          sublabel={
            isSkipped
              ? exchange
                ? 'Put it back in today'
                : 'Put it back in the sequence'
              : 'Excused — it won’t count against you'
          }
          onPress={toggleSkip}
        />
        <RowSeparator />
        <SheetRow icon="insights" label="Insights" onPress={openInsights} />
        <RowSeparator />
        <SheetRow icon="edit" label={`Edit ${noun}`} onPress={edit} />
        {/* An exchange has no stack to move between — its anchor is the urge, not a moment. */}
        {exchange ? null : (
          <>
            <RowSeparator />
            <SheetRow icon="addLink" label="Move to another stack" onPress={moveTo} />
          </>
        )}
        <RowSeparator />
        <SheetRow icon="delete" label={`Delete ${noun}`} danger onPress={confirmDelete} />
      </Surface>
    </FormSheet>
  );
}
