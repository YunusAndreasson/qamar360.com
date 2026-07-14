import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
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
  const insets = useSafeAreaInsets();
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
    <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.four }]}>
      <View style={styles.header}>
        <ThemedText type="heading">Add to stack</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {habit.name}
        </ThemedText>
      </View>

      <Surface>
        {options.map(({ stack, memberCount }, i) => (
          <Fragment key={stack.id}>
            {i > 0 ? <RowSeparator /> : null}
            <PickerRow
              icon="link"
              label={stack.name}
              sublabel={`${memberCount} ${memberCount === 1 ? 'habit' : 'habits'}`}
              onPress={() => addToStack(stack.id, stack.name)}
            />
          </Fragment>
        ))}
      </Surface>
    </View>
  );
}

/** One tappable option in the picker: a leading glyph, a title, and a muted sub-line. */
function PickerRow({
  icon,
  label,
  sublabel,
  onPress,
}: {
  icon: IconName;
  label: string;
  sublabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={sublabel}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <AppIcon name={icon} size={22} color={theme.textSecondary} />
      <View style={styles.rowText}>
        <ThemedText type="rowTitle" numberOfLines={1}>
          {label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {sublabel}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Padded content of a `fitToContents` sheet — the grabber sits above this, the safe-area
  // bottom inset is added inline so the last row clears the home indicator.
  sheet: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56, // comfortably above the 44pt minimum tap target
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  rowText: { flex: 1 },
});
