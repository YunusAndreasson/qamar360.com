import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useEffect } from 'react';

import { FormSheet, SheetRow } from '@/components/form-sheet';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { useToast } from '@/components/toast';
import { useHabits } from '@/hooks/use-habits';
import { placementToRestore } from '@/lib/drag-order';
import { haptics } from '@/lib/haptics';

/**
 * "Add to stack" — a native form sheet raised from a lone habit's trailing-swipe `Stack` action
 * (see {@link HabitRow}). It's the tap-first counterpart to the Today list's drag: pick an
 * existing stack to drop this habit into. (New stacks aren't made here — you start one by
 * dropping one habit onto another, so the swipe action only appears once a stack exists.)
 * Membership change goes through {@link useHabits.moveHabit} (the same mutation the drag
 * commits), with an Undo on the confirmation toast. Presented `fitToContents` so the sheet is
 * exactly as tall as its options — configured in the habits stack layout.
 */
export default function AddToStackScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();
  const { habits, stacks, moveHabit } = useHabits();

  const habit = habits.find((h) => h.id === habitId) ?? null;

  // Each stack with its current member count for the sub-line. Recomputed from `habits`, so an
  // add elsewhere stays in sync. (No useMemo — the React Compiler memoizes derived values.)
  const options = stacks.map((s) => ({
    stack: s,
    memberCount: habits.filter((h) => h.stack_id === s.id).length,
  }));

  const addToStack = (stackId: string, name: string) => {
    if (!habit) return;
    // Capture where the habit sits BEFORE the move, so Undo can put it back exactly there.
    const restore = placementToRestore(habits, habit.id);
    void moveHabit(habit.id, { toStackId: stackId });
    haptics.added();
    show(`Added to ${name}`, 'success', {
      label: 'Undo',
      onPress: () => {
        if (restore) void moveHabit(habit.id, restore);
      },
    });
    router.back();
  };

  // A habit deleted (or already grouped) while the sheet is up has nothing to add here — and
  // with no stacks left (the last one deleted elsewhere) there is nothing to add *to*. Close.
  const stale = !habit || habit.stack_id != null || stacks.length === 0;
  useEffect(() => {
    if (stale) router.back();
  }, [stale, router]);
  if (stale) return null;

  return (
    <FormSheet title="Add to stack" subtitle={habit.name}>
      <Surface>
        {options.map(({ stack, memberCount }, i) => (
          <Fragment key={stack.id}>
            {i > 0 ? <RowSeparator /> : null}
            <SheetRow
              icon="link"
              label={stack.name}
              sublabel={`${memberCount} ${memberCount === 1 ? 'habit' : 'habits'}`}
              onPress={() => addToStack(stack.id, stack.name)}
            />
          </Fragment>
        ))}
      </Surface>
    </FormSheet>
  );
}
