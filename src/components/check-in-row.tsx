import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CompletionRing } from '@/components/completion-ring';
import { ThemedText } from '@/components/themed-text';
import { RowLeadingSlot, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { checkInRowContract, type GoalCheckIn } from '@/lib/check-ins';

type Props = {
  goalId: string;
  title: string;
  unit: string;
  /** The real today, so an ask carried from an earlier day can say where it came from. */
  today: string;
  /** The day the unanswered ask belongs to, or `null` once it has been answered. */
  since: string | null;
  /** The reading given on the viewed day, or `null` while it is still being asked for. */
  answer: GoalCheckIn | null;
  /** The most recent reading before the viewed day — the figure the field opens on. */
  previous: GoalCheckIn | null;
  onPress: (goalId: string) => void;
};

/**
 * One check-in: a goal asking where you are.
 *
 * It wears the day's row exactly — the same 32-wide leading slot at the same 24pt, so one column
 * of {@link CompletionRing} marks runs down the whole screen whatever unit each section tracks —
 * and departs from it in one place. The row is a **button**, not a checkbox: there is nothing to
 * toggle, the tap raises a field, and announcing a checkbox would promise a gesture that does not
 * exist here. That is also why it carries no `⋯`. A to-do's options door exists because a to-do
 * can be rewritten or deleted from the day; a check-in is a question the goal is asking, and
 * everything you might do to it lives on the goal.
 *
 * Answered, it greys where it stands and shows the reading. It does not vanish and does not sink:
 * either would take the row out from under the finger that just typed a number, along with the
 * correction you might want a second later.
 *
 * RN's `Pressable`, not gesture-handler's `Touchable` — the same trap the task row documents.
 */
function CheckInRowBase({ goalId, title, unit, today, since, answer, previous, onPress }: Props) {
  const theme = useTheme();
  const row = checkInRowContract({ title, unit, today, since, answer, previous });
  const answered = row.mode === 'answered';

  return (
    <Pressable
      onPress={() => onPress(goalId)}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole={row.role}
      accessibilityLabel={row.label}
      accessibilityHint={row.hint}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <View style={styles.leading}>
        <CompletionRing complete={answered} size={24} strokeWidth={2} />
      </View>
      <View style={styles.text}>
        <ThemedText type="rowTitle" style={{ color: answered ? theme.textDisabled : theme.text }} numberOfLines={2}>
          {title}
        </ThemedText>
        {row.meta ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {row.meta}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 56 to match the stack card headers and the to-do rows; a wrapped title pushes past it.
  // No reserved trailing box: this row has no `⋯`, so the text runs to the same inset it starts
  // from rather than stopping short of a column nothing occupies.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  leading: RowLeadingSlot,
  text: { flex: 1, marginLeft: Spacing.three, gap: Spacing.half },
});

// Memoized on what the row paints, like every other row on the day.
function checkInPropsEqual(a: Props, b: Props): boolean {
  return (
    a.goalId === b.goalId &&
    a.title === b.title &&
    a.unit === b.unit &&
    a.today === b.today &&
    a.since === b.since &&
    a.answer?.id === b.answer?.id &&
    a.answer?.value === b.answer?.value &&
    a.previous?.id === b.previous?.id &&
    a.previous?.value === b.previous?.value &&
    a.onPress === b.onPress
  );
}

export const CheckInRow = memo(CheckInRowBase, checkInPropsEqual);
