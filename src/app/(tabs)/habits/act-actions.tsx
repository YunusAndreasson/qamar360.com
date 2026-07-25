import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { FormSheet, SheetRow } from '@/components/form-sheet';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive } from '@/lib/alerts';
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
 */
export default function ActActionsScreen() {
  const router = useRouter();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { habits, skipped, skipHabit, deleteHabit, isToday, viewDate } = useHabits();

  const habit = habits.find((h) => h.id === habitId) ?? null;
  const isSkipped = habit ? skipped.has(habit.id) : false;

  const toggleSkip = () => {
    if (!habit) return;
    void skipHabit(habit.id);
    router.back();
  };

  // `replace` (not push) so the next modal's Save/Close returns to Today, not back to this sheet.
  const openInsights = () => {
    if (!habit) return;
    router.replace({ pathname: '/habits/stats', params: { id: habit.id } });
  };

  const edit = () => {
    if (!habit) return;
    router.replace({ pathname: '/habits/editor', params: { id: habit.id } });
  };

  const moveTo = () => {
    if (!habit) return;
    router.replace({ pathname: '/habits/add-to-stack', params: { habitId: habit.id } });
  };

  const confirmDelete = () => {
    if (!habit) return;
    // Deleting drops the habit from state; the effect below backs the sheet out (don't also
    // router.back() here, or it pops twice).
    confirmDestructive({
      title: 'Delete act',
      message: `Delete “${habit.name}”? Its history goes with it.`,
      onConfirm: () => {
        haptics.removed();
        void deleteHabit(habit.id);
      },
    });
  };

  // An act deleted (here or elsewhere) while the sheet is up has nothing left to act on.
  useEffect(() => {
    if (habitId && !habit) router.back();
  }, [habitId, habit, router]);
  if (!habit) return null;

  return (
    <FormSheet title={habit.name} subtitle="Act">
      <Surface>
        {/* "Today" only when it is: on a backfilled day the row has to name the day it excuses. */}
        <SheetRow
          icon="skip"
          label={isSkipped ? 'Un-skip' : isToday ? 'Skip today' : `Skip ${viewDate}`}
          sublabel={isSkipped ? 'Put it back in the sequence' : 'Excused — it won’t count against you'}
          onPress={toggleSkip}
        />
        <RowSeparator />
        <SheetRow icon="insights" label="Insights" onPress={openInsights} />
        <RowSeparator />
        <SheetRow icon="edit" label="Edit act" onPress={edit} />
        <RowSeparator />
        <SheetRow icon="addLink" label="Move to another stack" onPress={moveTo} />
        <RowSeparator />
        <SheetRow icon="delete" label="Delete act" danger onPress={confirmDelete} />
      </Surface>
    </FormSheet>
  );
}
