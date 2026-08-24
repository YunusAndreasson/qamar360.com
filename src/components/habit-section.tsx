import { CardSection } from '@/components/card-section';
import { HabitRow } from '@/components/habit-row';
import { ManageRow } from '@/components/manage-row';
import { useToast } from '@/components/toast';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits, type Habit } from '@/hooks/use-habits';
import { suggestedMoments } from '@/lib/curated';
import { buildUnits, flattenUnits } from '@/lib/drag-order';
import { haptics } from '@/lib/haptics';
import { MOMENTS, type MomentKey } from '@/lib/moments';
import { normalizeName } from '@/lib/names';

type Props = {
  /** The day's stackless habits, in position order. */
  habits: Habit[];
  /** Space above the caption — the screen owns it, so the day's sections break on one rhythm. */
  topGap: number;
  completed: Set<string>;
  skipped: Set<string>;
  /** The viewed day's completions are being (re)fetched after a day-step. */
  settling: boolean;
  onToggle: (habit: Habit) => void;
  onOptions: (habit: Habit) => void;
};

/**
 * The day's habits that belong to no stack.
 *
 * For a year this was the "Anchor these" card: a one-time prompt to drain leftovers into stacks,
 * on the premise that a habit lives in a stack or nowhere. That premise cost more than it bought.
 * A stackless habit could not be ticked, which meant it could not be *finished* — and because
 * `dayCloseAfter` counts every scheduled, unexcused habit, a single one held the day open forever,
 * kept a phantom on the tab badge and sat in the Progress denominator earning nothing. The card
 * that was supposed to be a temporary migration was quietly breaking the day.
 *
 * So this is a section like any other now: its rows tick and manage exactly as an exchange's do,
 * and anchoring became one of the things you can *do* to a habit rather than the reason it is on
 * screen (the row's `⋯` → Move to a stack). The bulk offer survives as a quiet footer row, and only
 * while the curated library actually recognises something here.
 *
 * Placed after the stacks and before the exchanges: a stack has a place in the day's order because
 * its cue does, and these have none — but a plain habit is the ordinary case and an exchange the
 * special one, so it reads first. Outside the drag layer for the same reason the exchanges are:
 * there is no slot in the day's order to drag it into.
 */
export function HabitSection({ habits: loose, topGap, completed, skipped, settling, onToggle, onOptions }: Props) {
  const { show } = useToast();
  const { presets } = useCatalog();
  const { habits, stacks, createStack, updateStack, moveHabit, reorderHabits } = useHabits();

  // Folded name → the moment the library would give this habit. (No useMemo — the React Compiler
  // memoizes derived values.)
  const suggestions = suggestedMoments(presets);
  // Only what is on screen: an "Anchor all" that also moved habits the user can't see would be
  // reporting work they didn't watch happen.
  const suggested = loose.filter((h) => suggestions.get(normalizeName(h.name)) != null);

  if (loose.length === 0) return null;

  const anchorAll = async () => {
    // Group by the suggested moment, preserving each group's current order.
    const byMoment = new Map<MomentKey, Habit[]>();
    for (const habit of suggested) {
      const moment = suggestions.get(normalizeName(habit.name));
      if (!moment) continue;
      const arr = byMoment.get(moment);
      if (arr) arr.push(habit);
      else byMoment.set(moment, [habit]);
    }
    if (byMoment.size === 0) return;

    // Captured BEFORE the moves: the grouping pulls acts adjacent, so Undo has to restore the
    // whole order, not just the memberships (the same rule the drag's Undo follows).
    const prevOrder = flattenUnits(buildUnits(habits));
    const moved: Habit[] = [];
    haptics.added();

    // Sequential awaits are safe — createStack/updateStack keep `habitsRef` authoritative between
    // chained calls, so each group sees the previous one's result.
    for (const [moment, group] of byMoment) {
      const name = MOMENTS[moment].stackName;
      const twin = stacks.find((s) => normalizeName(s.name) === normalizeName(name));
      const ids = group.map((h) => h.id);
      if (twin) {
        // Append to the user's own same-named stack rather than minting a twin beside it.
        const current = habits
          .filter((h) => h.stack_id === twin.id)
          .sort((a, b) => a.position - b.position)
          .map((h) => h.id);
        await updateStack(twin.id, { orderedMemberIds: [...current, ...ids] });
      } else {
        await createStack(name, ids, { moment });
      }
      moved.push(...group);
    }

    const n = moved.length;
    show(`Anchored ${n} ${n === 1 ? 'habit' : 'habits'}`, 'success', {
      label: 'Undo',
      onPress: () => {
        // Out of their stacks first (an emptied shell deletes itself), then the exact prior order.
        for (const habit of moved) void moveHabit(habit.id, { toStackId: null });
        void reorderHabits(prevOrder);
      },
    });
  };

  return (
    <CardSection
      label="HABITS"
      topGap={topGap}
      // The offer, not the premise: only when the library recognises something here, and phrased
      // as a shortcut past the per-habit "Move to a stack" rather than as a chore to clear.
      //
      // A footer row inside the card, in the reading tone — the same `ManageRow` idiom as
      // "⋯ Manage stack" — and not the full-width accent button it used to be. That button was the
      // only primary action on the whole day, sitting under a list of things you tick, so it read
      // as what the section was *for*; accent is spent on what's live or interactive, and a bulk
      // convenience is neither of those enough to outrank the habits above it.
      trailing={
        suggested.length > 0 ? (
          <ManageRow
            icon="addLink"
            label={
              suggested.length === loose.length
                ? 'Anchor these to a moment'
                : `Anchor ${suggested.length} suggested`
            }
            accessibilityLabel={`Anchor ${suggested.length} suggested`}
            accessibilityHint="Moves them into stacks at the moments the library suggests."
            onPress={() => void anchorAll()}
          />
        ) : null
      }>
      {loose.map((habit) => (
        <HabitRow
          key={habit.id}
          habit={habit}
          done={completed.has(habit.id)}
          skipped={skipped.has(habit.id)}
          settling={settling}
          onToggle={onToggle}
          onOptions={onOptions}
        />
      ))}
    </CardSection>
  );
}
