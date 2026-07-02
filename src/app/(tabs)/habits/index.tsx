import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable, { type SortableGridRenderItem } from 'react-native-sortables';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { HabitRow } from '@/components/habit-row';
import { HabitsSkeleton } from '@/components/habits-skeleton';
import { HeaderActions, HeaderIconButton } from '@/components/header-icon-button';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { StackCard } from '@/components/stack-card';
import { ThemedText } from '@/components/themed-text';
import { Icons } from '@/constants/icons';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { type Habit, type HabitStack, useHabits } from '@/hooks/use-habits';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useTheme } from '@/hooks/use-theme';
import { addDaysISO, scheduledOn } from '@/lib/dates';
import { haptics } from '@/lib/haptics';

function viewDateTitle(viewDate: string, today: string): string {
  if (viewDate === today) return 'Today';
  if (viewDate === addDaysISO(today, -1)) return 'Yesterday';
  const date = new Date(viewDate + 'T12:00:00');
  // Within the last week a bare weekday is unambiguous; older than that it repeats
  // (the stepper reaches 30 days back), so carry the date to keep the title exact.
  return viewDate > addDaysISO(today, -7)
    ? date.toLocaleDateString('en-US', { weekday: 'long' })
    : date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

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
    skipped,
    counts,
    loading,
    error,
    today,
    viewDate,
    minViewDate,
    isToday,
    setViewDate,
    toggleHabit,
    adjustHabitCount,
    skipHabit,
    reorderHabits,
    deleteHabit,
    dismissError,
    refresh,
    reload,
  } = useHabits();
  // Refetch when the tab regains focus, so changes made outside this provider (e.g. resetting
  // progress from Settings) are reflected on return — mirrors the Progress tab.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // The scroll container ref hands auto-scroll-while-dragging to the sortable list.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // Pull-to-refresh. `refresh` is silent (no spinner); the RefreshControl owns the indicator.
  const { refreshControl } = usePullToRefresh(refresh);

  // The first load failed with nothing to show — offer a retry rather than a stuck screen.
  const loadFailed = !!error && habits.length === 0 && stacks.length === 0;
  // Only the habits scheduled for the viewed day appear in the day's checklist.
  const visibleHabits = useMemo(() => habits.filter((h) => scheduledOn(h, viewDate)), [habits, viewDate]);

  // A quiet heads-up the day before a Hijri-only act (e.g. the White Days fast): such habits
  // otherwise surface for the first time on the day itself — too late to prepare (suhūr, intention).
  // Only acts that are new tomorrow (not already scheduled today) are flagged.
  const tomorrow = addDaysISO(today, 1);
  const upcomingTomorrow = useMemo(
    () => habits.filter((h) => h.hijri_schedule && scheduledOn(h, tomorrow) && !scheduledOn(h, today)),
    [habits, tomorrow, today],
  );

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
      const first = sorted[0];
      if (!first) continue; // a stack always has ≥1 member, but keep the index access honest
      out.push({ type: 'stack', stack: stackById.get(stackId)!, members: sorted, sortKey: first.position });
    }
    return out.sort((a, b) => a.sortKey - b.sortKey);
  }, [visibleHabits, stacks]);

  const canGoBack = viewDate > minViewDate;
  const canGoForward = viewDate < today;

  const stepViewDate = useCallback(
    (delta: number) => {
      if ((delta < 0 && !canGoBack) || (delta > 0 && !canGoForward)) return;
      setViewDate(addDaysISO(viewDate, delta));
    },
    [canGoBack, canGoForward, setViewDate, viewDate],
  );

  const openEditor = useCallback(
    (habit: Habit) => router.push({ pathname: '/habits/editor', params: { id: habit.id } }),
    [router],
  );

  const openStackEditor = useCallback(
    (stackId: string) => router.push({ pathname: '/habits/stack-editor', params: { id: stackId } }),
    [router],
  );

  const renderItem = useCallback<SortableGridRenderItem<Entry>>(
    ({ item }) =>
      item.type === 'stack' ? (
        <StackCard
          stack={item.stack}
          members={item.members}
          completed={completed}
          skipped={skipped}
          counts={counts}
          onToggle={toggleHabit}
          onAdjust={adjustHabitCount}
          onSkip={skipHabit}
          onEdit={openEditor}
          onDelete={deleteHabit}
          onEditStack={openStackEditor}
        />
      ) : (
        <HabitRow
          habit={item.habit}
          done={completed.has(item.habit.id)}
          skipped={skipped.has(item.habit.id)}
          count={counts.get(item.habit.id) ?? 0}
          onToggle={toggleHabit}
          onAdjust={adjustHabitCount}
          onSkip={skipHabit}
          onEdit={openEditor}
          onDelete={deleteHabit}
          standalone
        />
      ),
    [completed, skipped, counts, toggleHabit, adjustHabitCount, skipHabit, openEditor, deleteHabit, openStackEditor],
  );

  // The list shows only the scheduled subset; flatten the reordered entries (stack members
  // stay together, in sequence) back onto the full habit list before persisting positions.
  const onDragEnd = useCallback(
    ({ data }: { data: Entry[] }) => {
      const reordered = data.flatMap((e) => (e.type === 'stack' ? e.members.map((m) => m.id) : [e.habit.id]));
      const visibleIds = new Set(reordered);
      let vi = 0;
      // visibleIds is built from `reordered`, so the counts match and the `?? h.id` never fires —
      // it just keeps the result a clean string[] for reorderHabits.
      const fullIds = habits.map((h) => (visibleIds.has(h.id) ? reordered[vi++] ?? h.id : h.id));
      void reorderHabits(fullIds);
    },
    [habits, reorderHabits],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: viewDateTitle(viewDate, today),
          headerLargeTitle: true,
          headerLeft: () =>
            Platform.OS === 'ios' ? (
              <HeaderActions>
                <DateStepperButtons canGoBack={canGoBack} canGoForward={canGoForward} onStep={stepViewDate} />
              </HeaderActions>
            ) : null,
          headerRight: () => (
            <HeaderActions>
              {Platform.OS !== 'ios' ? (
                <DateStepperButtons canGoBack={canGoBack} canGoForward={canGoForward} onStep={stepViewDate} />
              ) : null}
              {/* One door to add: the Add screen leads with "create your
                  own" and the curated Sunnah library below it. */}
              <HeaderIconButton
                icon={Icons.add}
                color={theme.accent}
                accessibilityLabel="Add habit or stack"
                onPress={() => router.push('/habits/discover')}
              />
            </HeaderActions>
          ),
        }}
      />

      {loading ? (
        <AppScreen transparent>
          <HabitsSkeleton />
        </AppScreen>
      ) : loadFailed ? (
        <AppScreen transparent centered>
          <EmptyState
            icon="cloudOff"
            title="Couldn't load your habits"
            body={error ?? 'Check your connection and try again.'}>
            <AppButton onPress={() => void reload()} accessibilityLabel="Try loading again">
              Try again
            </AppButton>
          </EmptyState>
        </AppScreen>
      ) : (
        // The transparent scroll view is the screen's sole content, so it is the screen's
        // first descendant — which is what the native large title tracks to collapse on scroll
        // (react-native-screens walks the first-subview chain). The fixed lunar sky lives behind
        // the whole stack (in the habits layout) and shows through this transparent scroll.
        // (Animated.ScrollView so the sortable list's auto-scroll can drive it via the ref.)
        <Animated.ScrollView
          ref={scrollRef}
          style={[styles.list, styles.transparent]}
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} onDismiss={dismissError} style={styles.banner} />
          {isToday && upcomingTomorrow.length > 0 ? <UpcomingHint habits={upcomingTomorrow} /> : null}
          {entries.length === 0 ? (
            <HabitsEmptyState
              hasHabits={habits.length > 0}
              isToday={isToday}
              onAdd={() => router.push({ pathname: '/habits/editor', params: { id: 'new' } })}
              onBrowse={() => router.push('/habits/discover')}
            />
          ) : (
            <View style={styles.gridWrap}>
              {/* Drag-to-reorder is the sortable list's own long-press gesture (no per-row drag
                  wiring): hold any card ~as long as the old long-press, and it lifts with the
                  same scale/shadow the hand-rolled `lifted` style used to draw. Entering/exiting
                  item presets are disabled — they're the Reanimated layout animations that stick
                  at opacity 0 on this app's New Architecture setup (see FadeInView). */}
              <Sortable.Grid
                columns={1}
                data={entries}
                renderItem={renderItem}
                keyExtractor={(entry) => (entry.type === 'stack' ? `stack-${entry.stack.id}` : `habit-${entry.habit.id}`)}
                onDragEnd={onDragEnd}
                onDragStart={() => haptics.pickup()}
                scrollableRef={scrollRef}
                rowGap={Spacing.two}
                dragActivationDelay={400}
                activeItemScale={1.03}
                activeItemShadowOpacity={0.24}
                inactiveItemOpacity={1}
                overDrag="vertical"
                itemEntering={null}
                itemExiting={null}
              />
            </View>
          )}
        </Animated.ScrollView>
      )}
    </>
  );
}

/** The day-stepper glyphs shared by the iOS `headerLeft` and the Android `headerRight`. */
function DateStepperButtons({
  canGoBack,
  canGoForward,
  onStep,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onStep: (delta: number) => void;
}) {
  const theme = useTheme();
  return (
    <>
      <HeaderIconButton
        icon={Icons.chevronLeft}
        color={canGoBack ? theme.accent : theme.textSecondary}
        accessibilityLabel="Previous day"
        disabled={!canGoBack}
        onPress={() => onStep(-1)}
        style={styles.dateStepButton}
      />
      {canGoForward ? (
        <HeaderIconButton
          icon={Icons.chevronRight}
          color={theme.accent}
          accessibilityLabel="Next day"
          onPress={() => onStep(1)}
          style={styles.dateStepButton}
        />
      ) : null}
    </>
  );
}

/** A quiet "the night before" pill listing Hijri acts that begin tomorrow. */
function UpcomingHint({ habits }: { habits: Habit[] }) {
  const theme = useTheme();
  const label = habits.length === 1 && habits[0] ? habits[0].name : `${habits.length} Sunnah acts`;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Tomorrow: ${label}`}
      style={[styles.upcoming, { backgroundColor: theme.accentSubtle }]}>
      <AppIcon name="moon" size={16} color={theme.accent} />
      <ThemedText type="small" numberOfLines={1} themeColor="accent" style={styles.upcomingText}>
        Tomorrow · {label}
      </ThemedText>
    </View>
  );
}

function HabitsEmptyState({
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
  // A rest day (you have habits, none fall today) is a calm, action-free "bedtime" note. The
  // brand-new user instead gets the warm moon emblem and a clear, inviting way in.
  if (hasHabits) {
    return (
      <EmptyState
        icon="bedtime"
        title="Nothing scheduled"
        body={isToday ? 'Enjoy your rest day.' : 'No habits were scheduled for this day.'}
      />
    );
  }
  return (
    // First-run call-to-action — lead the new user to the curated library (knowledge in the
    // world), with manual entry as a quieter secondary path.
    <EmptyState
      art={<MoonEmblem />}
      title="Start your first habit"
      body="Pick one from the Sunnah library, or create your own.">
      <AppButton onPress={onBrowse} accessibilityLabel="Browse Sunnah habits">
        Browse Sunnah habits
      </AppButton>
      <AppButton variant="secondary" onPress={onAdd} accessibilityLabel="Add your own habit" hitSlop={8}>
        Add your own
      </AppButton>
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  // The list is transparent so the fixed sky (rendered behind the stack) shows through it.
  transparent: { backgroundColor: 'transparent' },
  dateStepButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full, // a circular tap target
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  banner: { marginHorizontal: Spacing.three, marginTop: Spacing.two, marginBottom: Spacing.one },
  upcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.one,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  upcomingText: { flex: 1 },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  // The cards' old margins, moved up here: the sortable list measures each bare item, so
  // per-item margins would overlap the measured slots — side gutters and edge breathing room
  // live on this wrapper instead (and the between-card space is the grid's `rowGap`).
  gridWrap: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
