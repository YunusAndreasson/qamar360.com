import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { useToast } from '@/components/toast';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabits } from '@/hooks/use-habits';
import { placementToRestore } from '@/lib/drag-order';
import { haptics } from '@/lib/haptics';
import { clashOnMove, moveRefusal } from '@/lib/names';

/**
 * The stack picker — "where does this act live?".
 *
 * Raised from an act's options to move it out of one sequence into another, or to give a moment to
 * a habit that stands on its own. Whichever way it was raised the question is the same, so the
 * sheet is the same.
 *
 * "New stack" leads, because "none of these" must never be a dead end: it hands the act to the
 * new-stack modal, which lands it the moment the stack exists.
 *
 * It used to carry a Delete row for an unanchored habit, because Today could render only stacks and
 * such a habit had no options sheet to be reached from — it was the one habit in the app that
 * couldn't be deleted. It has its own row and its own sheet now (`HabitSection` → `act-actions`),
 * so deleting lives there with every other unit's and this sheet asks one question again.
 *
 * Presented `fitToContents` so the sheet is exactly as tall as its options, and composed as data
 * through `SheetActions` — the card every other options sheet is — rather than interleaving its
 * rows and rules by hand.
 */
export default function AddToStackScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { habits, stacks, moveHabit } = useHabits();

  const habit = habitId ? (habits.find((h) => h.id === habitId) ?? null) : null;
  // Each stack with its current act count for the sub-line. Recomputed from `habits`, so a change
  // elsewhere stays in sync. (No useMemo — the React Compiler memoizes derived values.)
  // `clash` marks a stack that already holds an act of this name: the move would put two identical
  // rows in one card, so the option says so before it is tapped rather than after.
  const options = stacks.map((s) => ({
    stack: s,
    memberCount: habits.filter((h) => h.stack_id === s.id).length,
    clash: habit ? clashOnMove(habits, habit.id, s.id) : null,
  }));

  // Nothing to place (the act was deleted while the sheet was up): close.
  useBackIfStale(!habit);
  if (!habit) return null;

  const addToStack = (stackId: string, name: string, clash: string | null) => {
    if (clash) {
      // Refused, not moved (`moveHabit` would refuse it too). Close all the same: the toast is a
      // root overlay, and this sheet would sit over it.
      show(moveRefusal(name, clash), 'danger');
      router.back();
      return;
    }
    haptics.added();
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
    // visible. Safe to call directly: a move leaves the habit in state, so the stale guard
    // above doesn't also fire and pop a second time.
    router.back();
  };

  // "None of these" is a real answer: hand the act to the new-stack modal, which lands it once the
  // stack exists. `replace` (not push) so that modal's Cancel returns to Today rather than back to
  // this sheet.
  const newStack = () => router.replace({ pathname: '/habits/stack-new', params: { pendingHabitId: habit.id } });

  return (
    <FormSheet title="Add to stack" subtitle={habit.name}>
      <SheetActions
        actions={[
          { icon: 'add', label: 'New stack', sublabel: 'Anchor it to a moment', onPress: newStack },
          ...options.map(({ stack, memberCount, clash }) => ({
            icon: 'link' as const,
            label: stack.name,
            sublabel: clash ? 'Already has this act' : `${memberCount} ${memberCount === 1 ? 'act' : 'acts'}`,
            onPress: () => addToStack(stack.id, stack.name, clash),
          })),
        ]}
      />
    </FormSheet>
  );
}
