import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddHabitBar } from '@/components/add-habit-bar';
import { HabitRow } from '@/components/habit-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { HabitsProvider, useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { formatDayHeader } from '@/lib/dates';

export default function HomeScreen() {
  return (
    <HabitsProvider>
      <HabitsScreen />
    </HabitsProvider>
  );
}

function HabitsScreen() {
  const theme = useTheme();
  const { habits, completedToday, loading, error, today, addHabit, toggleHabit, deleteHabit, dismissError } =
    useHabits();
  const dayLabel = useMemo(() => formatDayHeader(today), [today]);

  // Auto-dismiss the error banner so a transient failure doesn't linger.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(dismissError, 4000);
    return () => clearTimeout(timer);
  }, [error, dismissError]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Today</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {dayLabel}
          </ThemedText>
        </View>

        {error ? (
          <Pressable
            onPress={dismissError}
            accessibilityRole="button"
            accessibilityLabel={`${error} Tap to dismiss.`}
            style={styles.banner}>
            <ThemedText type="small" style={styles.bannerText}>
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
            <FlatList
              data={habits}
              keyExtractor={(habit) => habit.id}
              renderItem={({ item }) => (
                <HabitRow
                  habit={item}
                  done={completedToday.has(item.id)}
                  onToggle={toggleHabit}
                  onDelete={deleteHabit}
                />
              )}
              ListEmptyComponent={<EmptyState />}
              ListFooterComponent={<AddHabitBar onAdd={addHabit} />}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <ThemedText type="default" style={[styles.emptyText, { color: theme.textSecondary }]}>
        No habits yet.
      </ThemedText>
      <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
        Add one below to start ticking off your day.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.half,
  },
  banner: {
    backgroundColor: '#e5484d',
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
  },
  bannerText: { color: '#ffffff' },
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
