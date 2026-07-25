import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useEffect } from 'react';

import { FormSheet, SheetRow } from '@/components/form-sheet';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { useToast } from '@/components/toast';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits } from '@/hooks/use-habits';
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
 * new-stack modal, which lands it the moment the stack exists.
 *
 * Presented `fitToContents` so the sheet is exactly as tall as its options.
 */
export default function AddToStackScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { habitId, presetId } = useLocalSearchParams<{ habitId?: string; presetId?: string }>();
  const { habits, stacks, moveHabit, createHabitInStack } = useHabits();
  const { presets } = useCatalog();

  const habit = habitId ? (habits.find((h) => h.id === habitId) ?? null) : null;
  const preset = presetId ? (presets.find((p) => p.id === presetId) ?? null) : null;
  const subject = habit?.name ?? preset?.name ?? '';

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
    // No router.back() here: the optimistic move flips `habit.stack_id` synchronously, which
    // makes the `stale` effect below close the sheet. Calling both fires GO_BACK twice — the
    // second has nothing to pop (the same rule habit-editor's confirmDelete documents).
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
  useEffect(() => {
    if (stale) router.back();
  }, [stale, router]);
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
      </Surface>
    </FormSheet>
  );
}
