import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useGoals } from '@/hooks/use-goals';
import { useHabits } from '@/hooks/use-habits';
import { confirmAgainstPlan, confirmDestructive } from '@/lib/alerts';
import { isExchange } from '@/lib/exchange';
import { haptics } from '@/lib/haptics';

/**
 * One act's options — the sheet a tap on an act line raises.
 *
 * Acts inside a stack are read, not ticked (the stack's seal completes them), so a tap on one has
 * to mean *inspect* instead. Everything you might want from a single habit lives here: excusing it
 * on a day it doesn't apply — the escape hatch the stack-only model needs, so an unavoidable miss
 * doesn't cost the whole stack — plus its history, its settings, and where it lives. The rows that
 * DO tick (a stackless habit, an exchange) reach the same sheet from the fold's manage door, since
 * their tap is spoken for.
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
  const { habits, skipped, skipHabit, deleteHabit, isToday, viewDate } = useHabits();
  // The stored rows only — not `useProgress`, which would pull the whole record to raise a sheet.
  // All this needs is which goal an act drives and what its owner wrote about slipping.
  const { goals, goalActs } = useGoals();

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

  // The goal this act drives, if any. A goal that has been set aside or reached asks nothing of
  // the day, so it neither interrupts a skip nor offers a row.
  //
  // Resolved from the OPEN goals rather than from the first engine row that names this habit: an
  // act can drive more than one goal, and taking whichever row came first meant a single released
  // goal could hide a live one — the row and the if-then prompt would both vanish while a real
  // goal still depended on the act.
  const openGoalIds = new Set(goals.filter((g) => g.status === 'open').map((g) => g.id));
  const goalAct = goalActs.find((a) => a.habit_id === habit.id && openGoalIds.has(a.goal_id)) ?? null;
  const goal = goalAct ? (goals.find((g) => g.id === goalAct.goal_id) ?? null) : null;

  const toggleSkip = () => {
    // Un-skipping is putting the act back; there is nothing to talk anyone out of.
    if (!isSkipped && goal?.if_then) {
      confirmAgainstPlan({
        plan: goal.if_then,
        onSkip: () => {
          void skipHabit(habit.id);
          router.back();
        },
      });
      return;
    }
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
            label: isSkipped ? 'Un-skip' : isToday ? 'Skip today' : `Skip ${viewDate}`,
            sublabel: isSkipped
              ? habit.stack_id
                ? 'Put it back in the sequence'
                : 'Put it back in today'
              : 'Excused — it won’t count against you',
            onPress: toggleSkip,
          },
          { icon: 'stats', label: 'Stats', onPress: openStats },
          // Where this act is going, for the acts that are going somewhere. It reads as part of
          // the act rather than as a separate feature, which is the whole arrangement: the goal
          // has no daily surface of its own and does not need one.
          goal
            ? {
                icon: 'moon',
                label: goal.title,
                sublabel: goalAct?.contributes ? 'This act counts toward it' : 'This act holds it in place',
                // Close the sheet, then navigate — not `replace`. Every other action here swaps
                // one screen of the *habits* stack for another, while this one leaves for the
                // Insights tab, whose stack declares the goal route's options. Replacing across
                // the two would leave this sheet's slot holding a route its own navigator does
                // not know about.
                onPress: () => {
                  router.back();
                  router.push({ pathname: '/(tabs)/insights/goal/[id]', params: { id: goal.id } });
                },
              }
            : null,
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
