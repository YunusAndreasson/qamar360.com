import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { CoalesceIn } from '@/components/coalesce-in';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { DragGhost, DragGrid, DraggableEntry, HabitDragProvider } from '@/components/habit-drag';
import { HabitRow } from '@/components/habit-row';
import { HabitsSkeleton } from '@/components/habits-skeleton';
import { HeaderActions, HeaderIconButton } from '@/components/header-icon-button';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { StackCard } from '@/components/stack-card';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Icons } from '@/constants/icons';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { type Habit, type HabitStack, useHabits } from '@/hooks/use-habits';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useStackActions } from '@/hooks/use-stack-actions';
import { useTheme } from '@/hooks/use-theme';
import { addDaysISO, scheduledOn } from '@/lib/dates';
import {
  buildUnits,
  flattenUnits,
  moveUnit,
  placementToRestore,
  type MovePlacement,
  type OrderMeta,
} from '@/lib/drag-order';
import { haptics } from '@/lib/haptics';
import { markStackCreated, useStackEverCreated } from '@/lib/hints';
import { newId } from '@/lib/id';
import { defaultStackName } from '@/lib/names';

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
    moveHabit,
    createStack,
    deleteStack,
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

  // The scroll container ref hands auto-scroll-while-dragging to the drag layer.
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
      if (!first) continue; // a populated stack always has ≥1 member, but keep the index access honest
      out.push({ type: 'stack', stack: stackById.get(stackId)!, members: sorted, sortKey: first.position });
    }
    // A stack with no members at all ("+ → New stack", waiting on its first habit) has no
    // position to inherit; it holds the end of the list, showing its "Add your first habit"
    // row. A stack whose members are merely hidden by the day filter stays hidden, as before —
    // the distinction is drawn against ALL habits, not just the day's.
    const stacksWithMembers = new Set<string>();
    for (const h of habits) if (h.stack_id) stacksWithMembers.add(h.stack_id);
    for (const s of stacks) {
      if (!stacksWithMembers.has(s.id)) {
        out.push({ type: 'stack', stack: s, members: [], sortKey: Number.MAX_SAFE_INTEGER });
      }
    }
    return out.sort((a, b) => a.sortKey - b.sortKey);
  }, [visibleHabits, habits, stacks]);

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

  // Tapping a stack card's header opens the native "manage stack" menu (rename / delete) —
  // an iOS action sheet or an Android bottom sheet. Composing its members is all drag on the card.
  const openStackActions = useStackActions();

  // A lone habit's "Add to stack" swipe action → the stack picker sheet (seeded with it).
  const openAddToStack = useCallback(
    (habit: Habit) => router.push({ pathname: '/habits/add-to-stack', params: { habitId: habit.id } }),
    [router],
  );

  // The empty stack card's "Add your first habit" row → the Add screen scoped to that stack
  // (presets, "your habits", and "create your own" all land inside it).
  const openAddHabits = useCallback(
    (stackId: string) => router.push({ pathname: '/habits/discover', params: { stackId } }),
    [router],
  );

  const { show: showToast } = useToast();

  // Commit "join a stack" (the drag's drop-onto-a-card and the picker sheet both land here
  // via moveHabit). The restore is captured BEFORE the move so the toast's Undo puts the habit
  // back exactly where it was (user control & freedom — a slip is one tap from undone).
  const addHabitToStack = useCallback(
    (habitId: string, stackId: string) => {
      const stack = stacks.find((s) => s.id === stackId);
      const restore = placementToRestore(habits, habitId);
      haptics.added();
      void moveHabit(habitId, { toStackId: stackId });
      if (!stack || !restore) return;
      showToast(`Added to ${stack.name}`, 'success', {
        label: 'Undo',
        onPress: () => void moveHabit(habitId, restore),
      });
    },
    [habits, stacks, moveHabit, showToast],
  );

  // Commit "leave a stack" — the member row's "Remove" swipe (default placement: right after
  // its former card) and the drag-out (an explicit drop slot). Removing the last member deletes
  // the stack, so that Undo recreates it (a fresh id — nothing references the old one).
  const removeFromStack = useCallback(
    (habit: Habit, placement?: MovePlacement) => {
      const stack = stacks.find((s) => s.id === habit.stack_id);
      const restore = placementToRestore(habits, habit.id);
      const wasOnlyMember = !!stack && habits.filter((h) => h.stack_id === stack.id).length === 1;
      haptics.removed();
      void moveHabit(habit.id, placement ? { toStackId: null, placement } : { toStackId: null });
      if (!stack || !restore) return;
      showToast(`Removed from ${stack.name}`, 'success', {
        label: 'Undo',
        onPress: () => {
          if (wasOnlyMember) void createStack(stack.name, [habit.id]);
          else void moveHabit(habit.id, restore);
        },
      });
    },
    [habits, stacks, moveHabit, createStack, showToast],
  );

  // The stack just created by a drag-merge — the only card that gets the coalesce spring-in (kept
  // set until the next merge; overwriting it lets the previous card, long settled, unwrap seamlessly).
  const [coalescingStackId, setCoalescingStackId] = useState<string | null>(null);

  // Drop one habit onto another → a brand-new stack holding both. Created instantly with a default
  // name (rename later from the card's ⋯ menu); the drop target hosts the new card at its slot and the
  // dragged habit joins after it. Undo deletes the fresh stack and restores the exact prior order —
  // createStack pulls the pair adjacent, so a bare delete would leave them regrouped where they landed.
  const mergeHabits = useCallback(
    async (draggedId: string, targetId: string) => {
      const prevOrder = flattenUnits(buildUnits(habits));
      haptics.added();
      // Pre-mint the stack id and mark it coalescing BEFORE createStack stamps it into state, so the
      // card animates its spring-in on its very first mount (only this card — not every card on load).
      const stackId = newId();
      setCoalescingStackId(stackId);
      const created = await createStack(defaultStackName(stacks), [targetId, draggedId], stackId);
      if (!created) return;
      showToast('Stack created', 'success', {
        label: 'Undo',
        onPress: () => {
          void deleteStack(created);
          void reorderHabits(prevOrder);
        },
      });
    },
    [habits, stacks, createStack, deleteStack, reorderHabits, showToast],
  );

  // The drag layer's "dropped one lone habit onto another (held long enough to arm the merge)".
  const onDropMerge = useCallback(
    (draggedKey: string, targetHabitId: string) => mergeHabits(draggedKey.slice('habit:'.length), targetHabitId),
    [mergeHabits],
  );

  // The key being dragged (ghost source), or null at rest. While a drag is live the scroll is
  // frozen so a vertical drag doesn't fight the list (auto-scroll drives it instead).
  const [dragEntryKey, setDragEntryKey] = useState<string | null>(null);
  const isDragging = dragEntryKey !== null;
  const onDragActive = useCallback((key: string | null) => setDragEntryKey(key), []);

  // The rendered entry order, mirrored into the drag layer's registry (keys in render order).
  const orderMeta = entries.map((entry): OrderMeta =>
    entry.type === 'stack'
      ? { key: `stack:${entry.stack.id}`, kind: 'stack', stackId: entry.stack.id }
      : { key: `habit:${entry.habit.id}`, kind: 'habit', stackId: null },
  );

  // stackId → its visible members' keys in sequence — the inner lists an in-card reorder drags
  // within (the member analogue of `orderMeta`; day-hidden members aren't rendered, so aren't here).
  const memberOrder: Record<string, string[]> = {};
  for (const entry of entries) {
    if (entry.type === 'stack') memberOrder[entry.stack.id] = entry.members.map((m) => `member:${m.id}`);
  }

  // A drop between entries: a top-level entry reorders (its members travel with it); a member
  // row dragged out of its card detaches to that exact slot.
  const onDropBetween = useCallback(
    (draggedKey: string, beforeKey: string) => {
      const anchor = beforeKey === '' ? null : beforeKey;
      if (draggedKey.startsWith('member:')) {
        const habit = habits.find((h) => h.id === draggedKey.slice('member:'.length));
        if (habit) removeFromStack(habit, { type: 'before-unit', key: anchor });
        return;
      }
      const units = buildUnits(habits);
      const next = moveUnit(units, draggedKey, anchor);
      if (next === units) return; // stale anchor — leave the order alone
      haptics.selection();
      void reorderHabits(flattenUnits(next));
    },
    [habits, removeFromStack, reorderHabits],
  );

  // A drop onto a glowing stack card: a standalone habit or another card's member joins it.
  const onDropInto = useCallback(
    (draggedKey: string, stackId: string) => {
      const habitId = draggedKey.slice(draggedKey.indexOf(':') + 1);
      addHabitToStack(habitId, stackId);
    },
    [addHabitToStack],
  );

  // A drop settled inside the member's own card: reorder within the stack. The gesture resolves
  // an insertion index among the *visible* members; translate it to an index in the *full* member
  // list so members hidden by the day filter keep their relative order (the same reason
  // `moveRowForA11y` works off the unfiltered `habits`).
  const onDropReorder = useCallback(
    (draggedKey: string, stackId: string, visibleIndex: number) => {
      const habitId = draggedKey.slice('member:'.length);
      const stackEntry = entries.find((e) => e.type === 'stack' && e.stack.id === stackId);
      const visibleMembers = stackEntry && stackEntry.type === 'stack' ? stackEntry.members : [];
      const beforeId = visibleMembers.map((m) => m.id).filter((id) => id !== habitId)[visibleIndex];
      const fullIds = habits
        .filter((h) => h.stack_id === stackId)
        .sort((a, b) => a.position - b.position)
        .map((h) => h.id)
        .filter((id) => id !== habitId);
      const index = beforeId === undefined ? fullIds.length : Math.max(0, fullIds.indexOf(beforeId));
      void moveHabit(habitId, { toStackId: stackId, placement: { type: 'member-index', index } });
    },
    [entries, habits, moveHabit],
  );

  // Screen-reader reorder (the Move up / Move down accessibility actions — everything the drag
  // can do without the gesture). Top-level entries step over their visible neighbour; a member
  // steps within its stack's sequence.
  const moveEntryForA11y = useCallback(
    (entryKey: string, delta: -1 | 1) => {
      const visible = entries.map((e) => (e.type === 'stack' ? `stack:${e.stack.id}` : `habit:${e.habit.id}`));
      const at = visible.indexOf(entryKey);
      const targetKey = at === -1 ? undefined : visible[at + delta];
      if (!targetKey) return; // already at the edge
      const units = buildUnits(habits);
      const targetAt = units.findIndex((u) => u.key === targetKey);
      if (targetAt === -1) return;
      // Up: land just before the neighbour. Down: land just after it (before its follower).
      const anchor = delta === -1 ? units[targetAt]!.key : (units[targetAt + 1]?.key ?? null);
      const next = moveUnit(units, entryKey, anchor);
      if (next === units) return;
      haptics.selection();
      void reorderHabits(flattenUnits(next));
      AccessibilityInfo.announceForAccessibility(delta === -1 ? 'Moved up' : 'Moved down');
    },
    [entries, habits, reorderHabits],
  );

  const moveRowForA11y = useCallback(
    (habit: Habit, delta: -1 | 1) => {
      if (!habit.stack_id) {
        moveEntryForA11y(`habit:${habit.id}`, delta);
        return;
      }
      const siblings = habits
        .filter((h) => h.stack_id === habit.stack_id)
        .sort((a, b) => a.position - b.position);
      const at = siblings.findIndex((h) => h.id === habit.id);
      const target = at + delta;
      if (at === -1 || target < 0 || target >= siblings.length) return;
      haptics.selection();
      void moveHabit(habit.id, { toStackId: habit.stack_id, placement: { type: 'member-index', index: target } });
      AccessibilityInfo.announceForAccessibility(delta === -1 ? 'Moved up' : 'Moved down');
    },
    [habits, moveEntryForA11y, moveHabit],
  );

  const moveStackForA11y = useCallback(
    (stackId: string, delta: -1 | 1) => moveEntryForA11y(`stack:${stackId}`, delta),
    [moveEntryForA11y],
  );

  // The gesture-free twin of drop-onto-a-habit: a screen-reader action on a lone row that folds it
  // with the immediately-following lone habit into a new stack (a stack-card neighbour is already
  // served by "Add to stack"). Passed to a row only when that neighbour exists, so the action never
  // no-ops.
  const groupWithNext = useCallback(
    (habit: Habit) => {
      const at = entries.findIndex((e) => e.type === 'habit' && e.habit.id === habit.id);
      const next = at === -1 ? undefined : entries[at + 1];
      if (!next || next.type !== 'habit') return;
      void mergeHabits(next.habit.id, habit.id);
      AccessibilityInfo.announceForAccessibility('Stack created');
    },
    [entries, mergeHabits],
  );

  // The one-shot "drag to stack" teaching pill: shown while this install has never had a stack
  // (persisted, so deleting your only stack doesn't resurrect the lesson) and the viewed day
  // actually offers the gesture (≥2 lone rows to fold together). Retired the moment any stack
  // exists — created by drag, the a11y action, or synced in from another device.
  const everHadStack = useStackEverCreated();
  useEffect(() => {
    if (stacks.length > 0) markStackCreated();
  }, [stacks.length]);
  const stackHintVisible = !everHadStack && stacks.length === 0 && entries.length >= 2;

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
              {/* One door to add: the sheet forks to a habit (the curated Sunnah
                  library, with "create your own" closing it) or a new stack. */}
              <HeaderIconButton
                icon={Icons.add}
                color={theme.accent}
                accessibilityLabel="Add habit or stack"
                onPress={() => router.push('/habits/add-menu')}
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
        // (Animated.ScrollView so the drag layer's auto-scroll can drive it via the ref.)
        <Animated.ScrollView
          ref={scrollRef}
          style={[styles.list, styles.transparent]}
          contentContainerStyle={[styles.listContent, entries.length === 0 && styles.emptyTop]}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={refreshControl}
          scrollEnabled={!isDragging}
          keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} onDismiss={dismissError} style={styles.banner} />
          {isToday && upcomingTomorrow.length > 0 ? <UpcomingHint habits={upcomingTomorrow} /> : null}
          {stackHintVisible ? <StackingHint /> : null}
          {entries.length === 0 ? (
            <HabitsEmptyState
              hasHabits={habits.length > 0}
              isToday={isToday}
              onAdd={() => router.push({ pathname: '/habits/editor', params: { id: 'new' } })}
            />
          ) : (
            <HabitDragProvider
              scrollRef={scrollRef}
              order={orderMeta}
              memberOrder={memberOrder}
              contentBottomInset={BottomTabInset + Spacing.four}
              onDragActive={onDragActive}
              onDropBetween={onDropBetween}
              onDropInto={onDropInto}
              onDropReorder={onDropReorder}
              onDropMerge={onDropMerge}>
              {/* One long-press drag vocabulary (hold ~a beat, then move): a lone habit reorders
                  through the gaps, joins the stack card it's dropped onto (accent ring), or —
                  held over another lone habit — folds the two into a new stack (that row rings
                  and pops); a stack card reorders as one unit, members in tow. The dragged item
                  floats as a ghost above the grid while its original holds the empty slot. Swipe
                  actions and the picker sheet remain as the explicit, screen-reader-friendly routes. */}
              <DragGrid>
                {entries.map((entry, index) =>
                  entry.type === 'stack' ? (
                    <DraggableEntry
                      key={`stack-${entry.stack.id}`}
                      entryKey={`stack:${entry.stack.id}`}
                      index={index}
                      kind="stack"
                      stackId={entry.stack.id}>
                      <CoalesceIn active={coalescingStackId === entry.stack.id}>
                        <StackCard
                          stack={entry.stack}
                          members={entry.members}
                          completed={completed}
                          skipped={skipped}
                          counts={counts}
                          onToggle={toggleHabit}
                          onAdjust={adjustHabitCount}
                          onSkip={skipHabit}
                          onEdit={openEditor}
                          onDelete={deleteHabit}
                          onEditStack={openStackActions}
                          onRemoveFromStack={removeFromStack}
                          onMove={moveStackForA11y}
                          onMoveHabit={moveRowForA11y}
                          onAddHabits={openAddHabits}
                        />
                      </CoalesceIn>
                    </DraggableEntry>
                  ) : (
                    <DraggableEntry
                      key={`habit-${entry.habit.id}`}
                      entryKey={`habit:${entry.habit.id}`}
                      index={index}
                      kind="habit"
                      stackId={null}>
                      <HabitRow
                        habit={entry.habit}
                        done={completed.has(entry.habit.id)}
                        skipped={skipped.has(entry.habit.id)}
                        count={counts.get(entry.habit.id) ?? 0}
                        onToggle={toggleHabit}
                        onAdjust={adjustHabitCount}
                        onSkip={skipHabit}
                        onEdit={openEditor}
                        onDelete={deleteHabit}
                        // The picker only helps once a stack exists to join — hidden otherwise
                        // (the first stack is made by dragging, which the teaching pill points at).
                        onAddToStack={stacks.length > 0 ? openAddToStack : undefined}
                        onMove={moveRowForA11y}
                        // Screen-reader "stack these two" — offered only when the next row is
                        // also a lone habit (the drag gesture's gesture-free equivalent).
                        onGroupWithNext={entries[index + 1]?.type === 'habit' ? groupWithNext : undefined}
                        standalone
                      />
                    </DraggableEntry>
                  ),
                )}
                <HabitsDragGhost
                  dragEntryKey={dragEntryKey}
                  entries={entries}
                  completed={completed}
                  skipped={skipped}
                  counts={counts}
                />
              </DragGrid>
            </HabitDragProvider>
          )}
        </Animated.ScrollView>
      )}
    </>
  );
}

/** The floating copy of whatever is being dragged (see {@link DragGhost}) — the same visuals as
 *  the original, but inert: every handler is a no-op behind the ghost's `pointerEvents="none"`. */
function HabitsDragGhost({
  dragEntryKey,
  entries,
  completed,
  skipped,
  counts,
}: {
  dragEntryKey: string | null;
  entries: Entry[];
  completed: Set<string>;
  skipped: Set<string>;
  counts: Map<string, number>;
}) {
  if (!dragEntryKey) return null;
  // A member being pulled out of its card floats as a card of its own (`standalone` wraps the
  // row in a Surface) — it reads as "this is leaving the stack" while it travels.
  if (dragEntryKey.startsWith('member:')) {
    const habitId = dragEntryKey.slice('member:'.length);
    const member = entries.flatMap((e) => (e.type === 'stack' ? e.members : [])).find((h) => h.id === habitId);
    if (!member) return null;
    return (
      <DragGhost>
        <HabitRow
          habit={member}
          done={completed.has(member.id)}
          skipped={skipped.has(member.id)}
          count={counts.get(member.id) ?? 0}
          onToggle={noop}
          onSkip={noop}
          onEdit={noop}
          onDelete={noop}
          standalone
        />
      </DragGhost>
    );
  }
  const entry =
    entries.find((e) => (e.type === 'stack' ? `stack:${e.stack.id}` : `habit:${e.habit.id}`) === dragEntryKey) ??
    null;
  if (!entry) return null;
  return (
    <DragGhost>
      {entry.type === 'stack' ? (
        <StackCard
          stack={entry.stack}
          members={entry.members}
          completed={completed}
          skipped={skipped}
          counts={counts}
          onToggle={noop}
          onAdjust={noop}
          onSkip={noop}
          onEdit={noop}
          onDelete={noop}
          onEditStack={noop}
          onRemoveFromStack={noop}
        />
      ) : (
        <HabitRow
          habit={entry.habit}
          done={completed.has(entry.habit.id)}
          skipped={skipped.has(entry.habit.id)}
          count={counts.get(entry.habit.id) ?? 0}
          onToggle={noop}
          onSkip={noop}
          onEdit={noop}
          onDelete={noop}
          standalone
        />
      )}
    </DragGhost>
  );
}

const noop = () => {};

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
      style={[styles.hintPill, { backgroundColor: theme.accentSubtle }]}>
      <AppIcon name="moon" size={16} color={theme.accent} />
      <ThemedText type="small" numberOfLines={1} themeColor="accent" style={styles.hintText}>
        Tomorrow · {label}
      </ThemedText>
    </View>
  );
}

/**
 * The one-shot habit-stacking teaching pill — the same quiet accent pill as {@link UpcomingHint},
 * but tappable: it names the gesture (the app's only invisible affordance) and opens the short
 * habit-stacking guide for the why. Gated by the caller until the first stack ever exists.
 */
function StackingHint() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/habits/stacking-info')}
      accessibilityRole="button"
      accessibilityLabel="Tip: drag one habit onto another to stack them"
      accessibilityHint="Opens a short guide to habit stacking"
      style={({ pressed }) => [
        styles.hintPill,
        styles.stackHint,
        { backgroundColor: theme.accentSubtle },
        pressed && { opacity: 0.7 },
      ]}>
      <AppIcon name="stack" size={16} color={theme.accent} />
      <ThemedText type="small" numberOfLines={1} themeColor="accent" style={styles.hintText}>
        Drag one habit onto another to stack them
      </ThemedText>
      <AppIcon name="chevronRight" size={14} color={theme.accent} />
    </Pressable>
  );
}

function HabitsEmptyState({
  hasHabits,
  isToday,
  onAdd,
}: {
  hasHabits: boolean;
  isToday: boolean;
  onAdd: () => void;
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
      body={'Pick one from the Sunnah library, or create your\u00A0own.'}>
      <BrowseHabitsButton />
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
  // The quiet accent pill above the list — shared by the "tomorrow" heads-up and the stacking
  // teaching hint, so the two read as one vocabulary when both show.
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.one,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  // The tappable variant meets the 44pt target the read-only pill doesn't need.
  stackHint: { minHeight: 44 },
  hintText: { flex: 1 },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  // Only when the list is empty: match the top offset AppScreen gives the Progress empty state
  // (its content has paddingTop: Spacing.two), so the two tabs' empty moons align pixel-for-pixel
  // instead of jumping a notch when you switch between them. The populated list keeps its flush top.
  emptyTop: { paddingTop: Spacing.two },
});
