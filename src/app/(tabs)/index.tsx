import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddHabitBar } from '@/components/add-habit-bar';
import { HabitEditor } from '@/components/habit-editor';
import { HabitRow } from '@/components/habit-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { type Habit, HabitsProvider, useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { formatDayHeader, formatMonthDay, scheduledOn, weekdayLong } from '@/lib/dates';

export default function HomeScreen() {
  return (
    <HabitsProvider>
      <HabitsScreen />
    </HabitsProvider>
  );
}

function HabitsScreen() {
  const theme = useTheme();
  const {
    habits,
    completed,
    loading,
    error,
    today,
    viewDate,
    isToday,
    canGoBack,
    setViewDate,
    stepDay,
    addHabit,
    toggleHabit,
    updateHabit,
    deleteHabit,
    reorderHabits,
    dismissError,
  } = useHabits();
  const [editing, setEditing] = useState<Habit | null>(null);

  // Auto-dismiss the error banner so a transient failure doesn't linger.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(dismissError, 4000);
    return () => clearTimeout(timer);
  }, [error, dismissError]);

  // Only the habits scheduled for the viewed day appear in the day's checklist.
  const visibleHabits = useMemo(() => habits.filter((h) => scheduledOn(h, viewDate)), [habits, viewDate]);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Habit>) => (
      <HabitRow
        habit={item}
        done={completed.has(item.id)}
        onToggle={toggleHabit}
        onEdit={setEditing}
        drag={drag}
        isActive={isActive}
      />
    ),
    [completed, toggleHabit],
  );

  // The list shows only the scheduled subset; map its new order back onto the full
  // habit list (leaving off-day habits in their slots) before persisting positions.
  const onDragEnd = useCallback(
    ({ data }: { data: Habit[] }) => {
      const visibleIds = new Set(data.map((h) => h.id));
      const reordered = data.map((h) => h.id);
      let vi = 0;
      const fullIds = habits.map((h) => (visibleIds.has(h.id) ? reordered[vi++] : h.id));
      void reorderHabits(fullIds);
    },
    [habits, reorderHabits],
  );

  const title = isToday ? 'Today' : weekdayLong(viewDate);
  const subtitle = isToday ? formatDayHeader(today) : `${formatMonthDay(viewDate)} · Tap for today`;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => stepDay(-1)}
            disabled={!canGoBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous day">
            <MaterialIcons name="chevron-left" size={30} color={canGoBack ? theme.text : theme.border} />
          </Pressable>
          <Pressable
            onPress={() => setViewDate(today)}
            disabled={isToday}
            style={styles.headerCenter}
            accessibilityRole="button"
            accessibilityLabel={isToday ? title : `${title}, ${subtitle}`}>
            <ThemedText type="subtitle">{title}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {subtitle}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => stepDay(1)}
            disabled={isToday}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next day">
            <MaterialIcons name="chevron-right" size={30} color={isToday ? theme.border : theme.text} />
          </Pressable>
        </View>

        {error ? (
          <Pressable
            onPress={dismissError}
            accessibilityRole="button"
            accessibilityLabel={`${error} Tap to dismiss.`}
            style={[styles.banner, { backgroundColor: theme.dangerSubtle, borderColor: theme.danger }]}>
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.textSecondary} />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <DraggableFlatList
              data={visibleHabits}
              keyExtractor={(habit) => habit.id}
              renderItem={renderItem}
              onDragEnd={onDragEnd}
              activationDistance={12}
              ListEmptyComponent={<EmptyState hasHabits={habits.length > 0} isToday={isToday} />}
              ListFooterComponent={isToday ? <AddHabitBar onAdd={addHabit} /> : null}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>

      {editing ? (
        <HabitEditor
          key={editing.id}
          habit={editing}
          onClose={() => setEditing(null)}
          onSave={updateHabit}
          onDelete={deleteHabit}
        />
      ) : null}
    </ThemedView>
  );
}

function EmptyState({ hasHabits, isToday }: { hasHabits: boolean; isToday: boolean }) {
  const theme = useTheme();
  const [line1, line2] = hasHabits
    ? ['Nothing scheduled.', isToday ? 'Enjoy your rest day.' : 'No habits were scheduled for this day.']
    : ['No habits yet.', 'Add one below to start ticking off your day.'];
  return (
    <View style={styles.empty}>
      <ThemedText type="default" style={[styles.emptyText, { color: theme.textSecondary }]}>
        {line1}
      </ThemedText>
      <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
        {line2}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: Spacing.half },
  banner: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
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
});
