import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment } from 'react';

import { FormSheet, SheetRow } from '@/components/form-sheet';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { useToast } from '@/components/toast';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits } from '@/hooks/use-habits';
import { confirmDestructive } from '@/lib/alerts';
import { habitInputFor } from '@/lib/curated';
import { placementToRestore } from '@/lib/drag-order';
import { haptics } from '@/lib/haptics';

/**
 * The stack picker — "where does this act live?".
 *
 * Since a habit only exists inside a stack, every path that would once have created a loose one
 * ends here: adding a preset from the browsable library, moving an act out of one sequence into
 * another, or giving a home to an un-anchored habit from before the rule. Whichever way it was
 * raised, the question is the same, so the sheet is the same.
 *
 * "New stack…" leads, because "none of these" must never be a dead end: it hands the act to the
 * new-stack modal, which lands it the moment the stack exists. "Nowhere — I'm done with it" is a
 * real answer too, so an act that has no stack yet can be deleted from here (see below).
 *
 * Presented `fitToContents` so the sheet is exactly as tall as its options.
 */
export default function AddToStackScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { habitId, presetId } = useLocalSearchParams<{ habitId?: string; presetId?: string }>();
  const { habits, stacks, moveHabit, createHabitInStack, deleteHabit } = useHabits();
  const { presets } = useCatalog();

  const habit = habitId ? (habits.find((h) => h.id === habitId) ?? null) : null;
  const preset = presetId ? (presets.find((p) => p.id === presetId) ?? null) : null;
  const subject = habit?.name ?? preset?.name ?? '';
  // An un-anchored habit — one left over from before every habit had to live in a stack, or one
  // whose stack was deleted out from under it. Today can only render stacks, so it has no act
  // sheet to be reached from, which made it the one habit in the app that couldn't be deleted:
  // this sheet is its only screen, so this is where its delete lives. An anchored act keeps its
  // own in `act-actions` — offering it again here, on the way to "move", would only add a slip.
  const orphan = !!habit && !habit.stack_id;

  // Each stack with its current act count for the sub-line. Recomputed from `habits`, so a change
  // elsewhere stays in sync. (No useMemo — the React Compiler memoizes derived values.)
  const options = stacks.map((s) => ({
    stack: s,
    memberCount: habits.filter((h) => h.stack_id === s.id).length,
  }));

  const addToStack = (stackId: string, name: string) => {
    haptics.added();
    if (preset) {
      void createHabitInStack(habitInputFor(preset), stackId);
      show(`Added to ${name}`, 'success');
      router.back();
      return;
    }
    if (!habit) return;
    // Capture where the act sits BEFORE the move, so Undo can put it back exactly there.
    const restore = placementToRestore(habits, habit.id);
    void moveHabit(habit.id, { toStackId: stackId });
    show(`Moved to ${name}`, 'success', {
      label: 'Undo',
      onPress: () => {
        if (restore) void moveHabit(habit.id, restore);
      },
    });
    // The question is answered — close, so the toast (and the card the act just joined) are
    // visible. Safe to call directly: a move leaves the habit in state, so the `stale` effect
    // below doesn't also fire and pop a second time.
    router.back();
  };

  const confirmDelete = () => {
    if (!habit) return;
    // No router.back() on confirm: deleting drops the habit from state, which makes the `stale`
    // effect below close the sheet. Doing both fires GO_BACK twice.
    confirmDestructive({
      title: 'Delete act',
      message: `Delete “${habit.name}”? Its history goes with it.`,
      onConfirm: () => {
        haptics.removed();
        void deleteHabit(habit.id);
      },
    });
  };

  // "None of these" is a real answer: hand the subject to the new-stack modal, which lands it
  // once the stack exists. `replace` (not push) so that modal's Cancel returns to Today rather
  // than back to this sheet.
  const newStack = () =>
    router.replace({
      pathname: '/habits/stack-new',
      params: habit ? { pendingHabitId: habit.id } : { pendingPresetId: preset?.id ?? '' },
    });

  // Nothing to place (the act was deleted, or the preset id is unknown to the catalog): close.
  const stale = !habit && !preset;
  useBackIfStale(stale);
  if (stale) return null;

  return (
    <FormSheet title="Add to stack" subtitle={subject}>
      <Surface>
        <SheetRow icon="add" label="New stack…" sublabel="Anchor it to a moment" onPress={newStack} />
        {options.map(({ stack, memberCount }) => (
          <Fragment key={stack.id}>
            <RowSeparator />
            <SheetRow
              icon="link"
              label={stack.name}
              sublabel={`${memberCount} ${memberCount === 1 ? 'act' : 'acts'}`}
              onPress={() => addToStack(stack.id, stack.name)}
            />
          </Fragment>
        ))}
        {orphan ? (
          <>
            <RowSeparator />
            <SheetRow icon="delete" label="Delete act" danger onPress={confirmDelete} />
          </>
        ) : null}
      </Surface>
    </FormSheet>
  );
}
