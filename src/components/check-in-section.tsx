import { CardSection } from '@/components/card-section';
import { CheckInRow } from '@/components/check-in-row';
import type { CheckInEntry } from '@/lib/check-ins';
import type { Goal } from '@/lib/goals';

type Props = {
  /** The viewed day's check-ins, in the goals' own order (`lib/check-ins.visibleCheckIns`). */
  entries: CheckInEntry<Goal>[];
  /** Space above the caption — the screen owns it, so the day's sections break on one rhythm. */
  topGap: number;
  /** The real today, so an ask carried forward can say where it came from. */
  today: string;
  onPress: (goalId: string) => void;
};

/**
 * CHECK IN — what your goals are asking of you today.
 *
 * Under the to-dos and above the practice. It is an ask, like a to-do, and belongs with the things
 * the day is holding rather than among the acts you keep — but it reports *on* the practice, so it
 * sits below the errands that expire and above the stacks that come round again.
 *
 * Not permanent chrome, for the same reason `TaskSection` is not: with nothing due it renders
 * nothing at all, and a goal that asks once a month is invisible on the other twenty-eight days.
 * There is no `＋ Add` row either — a check-in belongs to a goal, and the way to start one is the
 * header "+", which routes to the goal it will hang on.
 */
export function CheckInSection({ entries, topGap, today, onPress }: Props) {
  if (entries.length === 0) return null;
  return (
    <CardSection label="CHECK IN" topGap={topGap}>
      {entries.map((entry) => (
        <CheckInRow
          key={entry.goal.id}
          goalId={entry.goal.id}
          title={entry.goal.title}
          unit={entry.goal.unit}
          today={today}
          since={entry.since}
          answer={entry.answer}
          previous={entry.previous}
          onPress={onPress}
        />
      ))}
    </CardSection>
  );
}
