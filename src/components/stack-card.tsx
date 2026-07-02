import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { HabitRow } from '@/components/habit-row';
import { PressableScale } from '@/components/pressable-scale';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Habit, HabitStack } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  stack: HabitStack;
  /** The stack's members scheduled for the viewed day, in sequence order. */
  members: Habit[];
  completed: Set<string>;
  /** Ids of members skipped (excused) for the viewed day. */
  skipped: Set<string>;
  /** For count-goal members: the count logged for the viewed day (habit id → count). */
  counts: Map<string, number>;
  onToggle: (id: string) => void;
  /** Step a count-goal member's logged count for the viewed day by `delta` (±1). */
  onAdjust: (id: string, delta: number) => void;
  onSkip: (id: string) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (id: string) => void;
  onEditStack: (stackId: string) => void;
};

/**
 * A stack rendered as one logical unit: a titled card holding its member habits in
 * sequence, visually set apart from the rows before and after it. Presentation only —
 * each member is still ticked individually. The header opens the stack editor; the
 * long-press pickup to reorder the whole card belongs to the sortable list around it.
 */
function StackCardBase({ stack, members, completed, skipped, counts, onToggle, onAdjust, onSkip, onEdit, onDelete, onEditStack }: Props) {
  const theme = useTheme();

  return (
    <Surface>
      <PressableScale
        onPress={() => onEditStack(stack.id)}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="button"
        accessibilityLabel={`${stack.name} stack`}
        accessibilityHint="Activates to edit the stack. Long press to reorder."
        style={styles.header}>
        <AppIcon name="link" size={18} color={theme.accent} />
        <ThemedText type="smallBold" themeColor="accent" style={styles.title} numberOfLines={1}>
          {stack.name}
        </ThemedText>
        {/* Same size + tone as the Settings rows' disclosure chevron — one glyph, one treatment. */}
        <AppIcon name="chevronRight" size={22} color={theme.textSecondary} />
      </PressableScale>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View>
        {members.map((habit, index) => (
          <View key={habit.id}>
            {/* Inset row divider — the same inset-grouped-list rule as the Settings sections. */}
            {index > 0 ? <RowSeparator /> : null}
            <HabitRow
              habit={habit}
              done={completed.has(habit.id)}
              skipped={skipped.has(habit.id)}
              count={counts.get(habit.id) ?? 0}
              onToggle={onToggle}
              onAdjust={onAdjust}
              onSkip={onSkip}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </View>
        ))}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  // A bare `Surface` card (radius/border/bg come from Surface) — no margins: the sortable
  // list measures the bare item, so spacing comes from the list's `rowGap` + wrapper padding.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  title: { flex: 1 },
  // Full-bleed rule under the stack header (a header separator, distinct from the row dividers).
  divider: { height: StyleSheet.hairlineWidth },
});

// Memoized: a card re-renders only when its members' done-state or identity changes.
export const StackCard = memo(StackCardBase);
