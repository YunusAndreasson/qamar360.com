import { memo } from 'react';

import { LooseRow } from '@/components/loose-row';
import type { Habit } from '@/hooks/use-habits';
import { habitMetaLine, habitRowContract } from '@/lib/loose-row';

type Props = {
  habit: Habit;
  /** Done for the viewed day. */
  done: boolean;
  /** Excused for the viewed day: out of the rate entirely, and the row goes inert. */
  skipped: boolean;
  /** A count goal's logged count for the viewed day. */
  count?: number;
  /** The viewed day's completions are being (re)fetched after a day-step. */
  settling: boolean;
  /** Tick it, or take it back. */
  onToggle: (habit: Habit) => void;
  /** Open the act sheet — skip today, stats, edit, move to a stack, delete. */
  onOptions: (habit: Habit) => void;
};

/**
 * One habit that belongs to no stack — the ordinary case.
 *
 * The shape is {@link LooseRow}, the same one an exchange wears, because both stand on their own
 * and are ticked one at a time. What differs is how little there is to say: no displaced routine,
 * no cue. So the second line is what the day is actually asking for — a count goal, the days it
 * runs on, or both ({@link habitMetaLine}) — and nothing at all for the every-day habit with no
 * goal, which is most of them.
 *
 * That this row exists at all is a reversal of the stacks-only rule: an unanchored habit used to be
 * legacy debris, listed in an "Anchor these" card and impossible to tick. It was also a live bug —
 * `dayCloseAfter` counts every scheduled, unexcused habit, so one of these could hold the day open
 * forever while offering nothing to complete. Being tickable *is* the fix.
 */
function HabitRowBase({ habit, done, skipped, count = 0, settling, onToggle, onOptions }: Props) {
  return (
    <LooseRow
      contract={habitRowContract({
        name: habit.name,
        meta: habitMetaLine({
          targetCount: habit.target_count,
          targetUnit: habit.target_unit,
          scheduleDays: habit.schedule_days,
          hijriSchedule: habit.hijri_schedule,
          count,
          done,
        }),
        done,
        skipped,
        count: habit.target_count != null ? { count, target: habit.target_count } : undefined,
      })}
      settling={settling}
      onToggle={() => onToggle(habit)}
      options={{
        accessibilityLabel: `Manage ${habit.name}`,
        accessibilityHint: 'Skip today, see stats, edit, move it into a stack, or delete it.',
        onPress: () => onOptions(habit),
      }}
    />
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
    a.count === b.count &&
    a.skipped === b.skipped &&
    a.settling === b.settling &&
    a.onToggle === b.onToggle &&
    a.onOptions === b.onOptions
  );
}

export const HabitRow = memo(HabitRowBase, habitPropsEqual);
