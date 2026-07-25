import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Face, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits, type Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { suggestedMoments } from '@/lib/curated';
import { buildUnits, flattenUnits } from '@/lib/drag-order';
import { haptics } from '@/lib/haptics';
import { MOMENTS, type MomentKey } from '@/lib/moments';
import { normalizeName } from '@/lib/names';

/**
 * The one-time home for habits made before every habit had to be anchored.
 *
 * A stack is now the only thing Today can render, so an unanchored habit would simply vanish from
 * the screen — this card is what keeps that from happening. It is deliberately *not* a silent
 * migration: where a habit belongs in someone's day is theirs to say, so the card proposes (from
 * the same library the ready-made stacks come from) and they confirm, in bulk or one at a time.
 *
 * Nothing can refill it — every creation path now lands inside a stack — so once it empties it is
 * gone for good.
 */
export function AnchorTheseCard({ habits: orphans }: { habits: Habit[] }) {
  const theme = useTheme();
  const router = useRouter();
  const { show } = useToast();
  const { presets } = useCatalog();
  const { habits, stacks, createStack, updateStack, moveHabit, reorderHabits } = useHabits();

  // Folded name → the moment the library would give this act. (No useMemo — the React Compiler
  // memoizes derived values.)
  const suggestions = suggestedMoments(presets);
  const suggestionFor = (habit: Habit) => suggestions.get(normalizeName(habit.name)) ?? null;
  const suggested = orphans.filter((h) => suggestionFor(h) !== null);

  const anchorAll = async () => {
    // Group by the suggested moment, preserving each group's current order.
    const byMoment = new Map<MomentKey, Habit[]>();
    for (const habit of orphans) {
      const moment = suggestionFor(habit);
      if (!moment) continue; // no suggestion — the user picks it by hand
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
      const name = MOMENTS[moment].label;
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
    <View style={styles.wrap}>
      <Surface>
        <View style={styles.header}>
          <AppIcon name="addLink" size={22} color={theme.accent} />
          <View style={styles.headerText}>
            <ThemedText type="rowTitle" themeColor="accent" style={styles.title}>
              Anchor these
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {orphans.length === 1
                ? 'One habit isn’t attached to a moment yet.'
                : `${orphans.length} habits aren’t attached to a moment yet.`}
            </ThemedText>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        {orphans.map((habit, index) => {
          const moment = suggestionFor(habit);
          return (
            <Fragment key={habit.id}>
              {index > 0 ? <RowSeparator /> : null}
              <Pressable
                onPress={() => router.push({ pathname: '/habits/add-to-stack', params: { habitId: habit.id } })}
                android_ripple={{ color: theme.backgroundSelected }}
                accessibilityRole="button"
                accessibilityLabel={
                  moment ? `${habit.name}, suggested ${MOMENTS[moment].label}` : `${habit.name}, no suggestion`
                }
                accessibilityHint="Activates to choose which stack it joins."
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="rowTitle" numberOfLines={1} style={styles.name}>
                  {habit.name}
                </ThemedText>
                {/* The proposal, stated so it can be overruled with one tap. flexShrink 0 —
                    Android clips trailing flex-row text otherwise (the "Undo"→"Und" gotcha). */}
                <ThemedText
                  type="small"
                  themeColor={moment ? 'textSecondary' : 'accent'}
                  style={styles.suggestion}>
                  {moment ? MOMENTS[moment].label : 'Choose…'}
                </ThemedText>
                <AppIcon name="chevronRight" size={14} color={theme.textDisabled} />
              </Pressable>
            </Fragment>
          );
        })}
        {suggested.length > 0 ? (
          <View style={styles.foot}>
            <AppButton
              onPress={() => void anchorAll()}
              accessibilityLabel={`Anchor ${suggested.length} suggested`}>
              {suggested.length === orphans.length
                ? 'Anchor all'
                : `Anchor ${suggested.length} suggested`}
            </AppButton>
          </View>
        ) : null}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits in the almanac strip's gutter, above the drag grid (it takes no part in the drag: it
  // isn't a stack, and nothing in it can be reordered).
  wrap: { marginHorizontal: Spacing.three, marginTop: Spacing.two },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  headerText: { flex: 1, gap: Spacing.half },
  // Semibold via the FACE, never fontWeight: a weight override beside rowTitle's registered
  // family would silently fall back to Roboto on Android (the theme.ts fake-bold gotcha).
  title: { fontFamily: Face.bodySemiBold },
  divider: { height: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  name: { flex: 1 },
  suggestion: { flexShrink: 0 },
  foot: { padding: Spacing.three },
});
