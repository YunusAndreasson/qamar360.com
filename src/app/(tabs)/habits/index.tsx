import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';

import { DateJumpPicker } from '@/components/date-jump-picker';
import { DayProgress } from '@/components/day-progress';
import { ErrorBanner } from '@/components/error-banner';
import { HabitRow } from '@/components/habit-row';
import { HeaderActions, HeaderIconButton, type HeaderIcon } from '@/components/header-icon-button';
import { StackCard } from '@/components/stack-card';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Pressed, Radius, Spacing } from '@/constants/theme';
import { type Habit, type HabitStack, useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { formatDayHeader, formatHijriDate, isoToLocalDate, scheduledOn, todayLocalISO } from '@/lib/dates';

const CALENDAR_ICON: HeaderIcon = { sf: 'calendar', material: 'calendar-today' };
const ADD_ICON: HeaderIcon = { sf: 'plus', material: 'add' };

/** A top-level row of the day's checklist: a lone habit, or a stack of habits. */
type Entry =
  | { type: 'habit'; habit: Habit; sortKey: number }
  | { type: 'stack'; stack: HabitStack; members: Habit[]; sortKey: number };

export default function HabitsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    habits,
    stacks,
    completed,
    loading,
    error,
    today,
    viewDate,
    minViewDate,
    isToday,
    setViewDate,
    toggleHabit,
    reorderHabits,
    deleteHabit,
    dismissError,
  } = useHabits();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Only the habits scheduled for the viewed day appear in the day's checklist.
  const visibleHabits = useMemo(() => habits.filter((h) => scheduledOn(h, viewDate)), [habits, viewDate]);

  // Fold the day's habits into top-level entries: stacks render as one grouped card,
  // sitting where their earliest member sits; lone habits keep their own slot.
  const entries = useMemo<Entry[]>(() => {
    const stackById = new Map(stacks.map((s) => [s.id, s]));
    const membersByStack = new Map<string, Habit[]>();
    const out: Entry[] = [];
    for (const h of visibleHabits) {
      const stack = h.stack_id ? stackById.get(h.stack_id) : undefined;
      if (stack) {
        const arr = membersByStack.get(stack.id);
        if (arr) arr.push(h);
        else membersByStack.set(stack.id, [h]);
      } else {
        out.push({ type: 'habit', habit: h, sortKey: h.position });
      }
    }
    for (const [stackId, members] of membersByStack) {
      const sorted = [...members].sort((a, b) => a.position - b.position);
      out.push({ type: 'stack', stack: stackById.get(stackId)!, members: sorted, sortKey: sorted[0].position });
    }
    return out.sort((a, b) => a.sortKey - b.sortKey);
  }, [visibleHabits, stacks]);

  // The viewed day's completion, for the progress summary above the list.
  const doneCount = useMemo(
    () => visibleHabits.reduce((n, h) => n + (completed.has(h.id) ? 1 : 0), 0),
    [visibleHabits, completed],
  );

  // The viewed day's Hijri date — a quiet lunar-calendar line under the title.
  const hijri = useMemo(() => formatHijriDate(viewDate), [viewDate]);

  const openEditor = useCallback(
    (habit: Habit) => router.push({ pathname: '/habits/editor', params: { id: habit.id } }),
    [router],
  );

  const openStackEditor = useCallback(
    (stackId: string) => router.push({ pathname: '/habits/stack-editor', params: { id: stackId } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Entry>) =>
      item.type === 'stack' ? (
        <StackCard
          stack={item.stack}
          members={item.members}
          completed={completed}
          onToggle={toggleHabit}
          onEdit={openEditor}
          onDelete={deleteHabit}
          onEditStack={openStackEditor}
          drag={drag}
          isActive={isActive}
        />
      ) : (
        <HabitRow
          habit={item.habit}
          done={completed.has(item.habit.id)}
          onToggle={toggleHabit}
          onEdit={openEditor}
          onDelete={deleteHabit}
          drag={drag}
          isActive={isActive}
        />
      ),
    [completed, toggleHabit, openEditor, deleteHabit, openStackEditor],
  );

  // The list shows only the scheduled subset; flatten the reordered entries (stack members
  // stay together, in sequence) back onto the full habit list before persisting positions.
  const onDragEnd = useCallback(
    ({ data }: { data: Entry[] }) => {
      const reordered = data.flatMap((e) => (e.type === 'stack' ? e.members.map((m) => m.id) : [e.habit.id]));
      const visibleIds = new Set(reordered);
      let vi = 0;
      const fullIds = habits.map((h) => (visibleIds.has(h.id) ? reordered[vi++] : h.id));
      void reorderHabits(fullIds);
    },
    [habits, reorderHabits],
  );

  const title = isToday ? 'Today' : formatDayHeader(viewDate);

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLargeTitle: true,
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton
                icon={CALENDAR_ICON}
                color={theme.accent}
                accessibilityLabel="Jump to a date"
                onPress={() => setPickerOpen(true)}
              />
              {/* One door to "add a habit": the New Habit screen leads with "create your
                  own" and the curated Sunnah library below it. */}
              <HeaderIconButton
                icon={ADD_ICON}
                color={theme.accent}
                accessibilityLabel="Add a habit"
                onPress={() => router.push('/habits/discover')}
              />
            </HeaderActions>
          ),
        }}
      />

      {loading ? (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : (
        <DraggableFlatList
          data={entries}
          keyExtractor={(entry) => (entry.type === 'stack' ? `stack-${entry.stack.id}` : `habit-${entry.habit.id}`)}
          renderItem={renderItem}
          onDragEnd={onDragEnd}
          activationDistance={12}
          contentInsetAdjustmentBehavior="automatic"
          // DraggableFlatList applies `style` to the inner FlatList but its outer
          // wrapper takes only `containerStyle` (no default flex) — so the flex+bg
          // must go there or the list collapses to zero height as the route's
          // direct child (no parent flex wrapper now, for native large-title).
          containerStyle={[styles.list, { backgroundColor: theme.background }]}
          style={styles.list}
          ListHeaderComponent={
            <>
              <ErrorBanner message={error} onDismiss={dismissError} style={styles.banner} />
              {hijri ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.hijri}>
                  {hijri}
                </ThemedText>
              ) : null}
              {visibleHabits.length > 0 ? <DayProgress done={doneCount} total={visibleHabits.length} /> : null}
            </>
          }
          ListEmptyComponent={
            <EmptyState
              hasHabits={habits.length > 0}
              isToday={isToday}
              onAdd={() => router.push({ pathname: '/habits/editor', params: { id: 'new' } })}
              onBrowse={() => router.push('/habits/discover')}
            />
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <DateJumpPicker
        visible={pickerOpen}
        value={isoToLocalDate(viewDate)}
        minimumDate={isoToLocalDate(minViewDate)}
        maximumDate={isoToLocalDate(today)}
        onPick={(date) => setViewDate(todayLocalISO(date))}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

function EmptyState({
  hasHabits,
  isToday,
  onAdd,
  onBrowse,
}: {
  hasHabits: boolean;
  isToday: boolean;
  onAdd: () => void;
  onBrowse: () => void;
}) {
  const theme = useTheme();
  const [line1, line2] = hasHabits
    ? ['Nothing scheduled.', isToday ? 'Enjoy your rest day.' : 'No habits were scheduled for this day.']
    : ['No habits yet.', 'Start with a Sunnah habit, or add your own.'];
  return (
    <View style={styles.empty}>
      <ThemedText type="default" style={[styles.emptyText, { color: theme.textSecondary }]}>
        {line1}
      </ThemedText>
      <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
        {line2}
      </ThemedText>
      {/* First-run call-to-action — lead the new user to the curated library (knowledge in
          the world), with manual entry as a quieter secondary path. */}
      {!hasHabits ? (
        <>
          <Pressable
            onPress={onBrowse}
            accessibilityRole="button"
            accessibilityLabel="Browse Sunnah habits"
            style={({ pressed }) => [
              styles.emptyButton,
              { backgroundColor: theme.accent },
              pressed && styles.pressedButton,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.accentText }}>
              Browse Sunnah habits
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel="Add your own habit"
            hitSlop={8}
            style={styles.secondaryLink}>
            <ThemedText type="small" themeColor="textSecondary">
              Add your own
            </ThemedText>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner: { marginHorizontal: Spacing.three, marginTop: Spacing.two, marginBottom: Spacing.one },
  hijri: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, letterSpacing: 0.3 },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  empty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    gap: Spacing.one,
  },
  emptyText: { textAlign: 'center' },
  emptyButton: {
    alignSelf: 'center',
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.control,
  },
  secondaryLink: { alignSelf: 'center', marginTop: Spacing.two, padding: Spacing.one },
  pressedButton: { opacity: Pressed.dim },
});
