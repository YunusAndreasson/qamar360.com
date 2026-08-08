import { memo } from 'react';

import { LooseRow, LooseRowDetail } from '@/components/loose-row';
import { RowSeparator } from '@/components/row-separator';
import type { Habit } from '@/hooks/use-habits';
import { describeHijriSchedule, describeWeekdays } from '@/lib/dates';
import { habitRowContract } from '@/lib/loose-row';
import { usePreference } from '@/lib/preferences';

type Props = {
  habit: Habit;
  /** Done for the viewed day. */
  done: boolean;
  /** Excused for the viewed day: out of the rate entirely, and the row goes inert. */
  skipped: boolean;
  /** The viewed day's completions are being (re)fetched after a day-step. */
  settling: boolean;
  /** Tick it, or take it back. */
  onToggle: (habit: Habit) => void;
  /** Open the act sheet — skip today, insights, edit, move to a stack, delete. */
  onOptions: (habit: Habit) => void;
  expanded: boolean;
  onSetExpanded: (habitId: string, expanded: boolean) => void;
};

/**
 * One habit that belongs to no stack — the ordinary case.
 *
 * The shape is {@link LooseRow}, the same one an exchange wears, because both stand on their own
 * and are ticked one at a time. What differs is how little there is to say: no displaced routine,
 * no cue, so the bar is the name alone (plus a count goal's target, the way an act row carries it)
 * and the fold reads the one thing the bar can't — **when it runs**.
 *
 * That this row exists at all is a reversal of the stacks-only rule: an unanchored habit used to be
 * legacy debris, listed in an "Anchor these" card and impossible to tick. It was also a live bug —
 * `dayCloseAfter` counts every scheduled, unexcused habit, so one of these could hold the day open
 * forever while offering nothing to complete. Being tickable *is* the fix.
 */
function HabitRowBase({ habit, done, skipped, settling, onToggle, onOptions, expanded, onSetExpanded }: Props) {
  const weekStart = usePreference('weekStart');

  // The count goal, as the act rows show it — the target is part of what you're being asked for,
  // so it belongs on the bar rather than behind the fold.
  const meta = habit.target_count ? `${habit.target_count}${habit.target_unit ? ` ${habit.target_unit}` : ''}` : '';

  return (
    <LooseRow
      contract={habitRowContract({ name: habit.name, meta, done, skipped })}
      settling={settling}
      onToggle={() => onToggle(habit)}
      expanded={expanded}
      onToggleFold={() => onSetExpanded(habit.id, !expanded)}
      foldLabel={`${habit.name} schedule`}
      foldHint={expanded ? 'Collapses the habit.' : 'Expands the habit to read its schedule.'}
      manage={{
        label: 'Manage habit',
        accessibilityLabel: `Manage ${habit.name}`,
        accessibilityHint: 'Skip today, see insights, edit, move it into a stack, or delete it.',
        onPress: () => onOptions(habit),
      }}>
      {/* When it runs. A stack says this with the moment it hangs off and an exchange with its cue;
          an unanchored habit has only its schedule, which is exactly why the fold shows it. */}
      <LooseRowDetail
        text={habit.hijri_schedule ? describeHijriSchedule(habit.hijri_schedule) : describeWeekdays(habit.schedule_days, weekStart)}
      />
      <RowSeparator />
    </LooseRow>
  );
}

// Memoized on what the row paints — see the same note on ActRow and ExchangeRow: a drag re-stamps
// `position` on every habit, so a default identity compare would rebuild the section on every drop.
function habitPropsEqual(a: Props, b: Props): boolean {
  return (
    a.habit.id === b.habit.id &&
    a.habit.name === b.habit.name &&
    a.habit.target_count === b.habit.target_count &&
    a.habit.target_unit === b.habit.target_unit &&
    a.habit.schedule_days === b.habit.schedule_days &&
    a.habit.hijri_schedule === b.habit.hijri_schedule &&
    a.done === b.done &&
    a.skipped === b.skipped &&
    a.settling === b.settling &&
    a.expanded === b.expanded &&
    a.onToggle === b.onToggle &&
    a.onOptions === b.onOptions &&
    a.onSetExpanded === b.onSetExpanded
  );
}

export const HabitRow = memo(HabitRowBase, habitPropsEqual);
