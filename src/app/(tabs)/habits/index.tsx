import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { BottomTabInset, MaxContentWidth, Pressed, Radius, Spacing } from '@/constants/theme';
import { type Habit, type HabitStack, useHabits } from '@/hooks/use-habits';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useStackActions } from '@/hooks/use-stack-actions';
import { useSunCycle } from '@/hooks/use-sun-cycle';
import { useTheme } from '@/hooks/use-theme';
import { addDaysISO, hijriParts, localDate, scheduledOn } from '@/lib/dates';
import {
  buildUnits,
  flattenUnits,
  fullMemberIndexForVisibleDrop,
  moveUnit,
  placementToRestore,
  type MovePlacement,
  type OrderMeta,
} from '@/lib/drag-order';
import { haptics } from '@/lib/haptics';
import { markStackCreated, useStackEverCreated } from '@/lib/hints';
import { newId } from '@/lib/id';
import { MOMENTS, momentBand, momentOf } from '@/lib/moments';
import { defaultStackName } from '@/lib/names';
import { usePreference } from '@/lib/preferences';
import { isStackComplete } from '@/lib/progress';
import { DAY_PARTS } from '@/lib/sun';

// The scroll's bottom inset — one constant shared by the layout and the drag layer's
// auto-scroll clamp, so the two can never drift apart. Spacing.five (not four): the list
// ends on a deliberate rest where the full sky reappears, completing the step scale
// (card gap 8 → zone break 16 → closing exhale 32).
const LIST_BOTTOM_INSET = BottomTabInset + Spacing.five;

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
  const hijriOffset = usePreference('hijriOffset');
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
  // progress from Settings) are reflected on return — mirrors the Progress tab. The FIRST focus
  // coincides with the provider's own mount load (both mount on entering the tabs), so it is
  // skipped: without the skip every cold entry runs the same three queries twice.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
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
  const visibleHabits = useMemo(
    () => habits.filter((h) => scheduledOn(h, viewDate, hijriOffset)),
    [habits, viewDate, hijriOffset],
  );

  // A quiet heads-up the day before a Hijri-only act (e.g. the White Days fast): such habits
  // otherwise surface for the first time on the day itself — too late to prepare (suhūr, intention).
  // Only acts that are new tomorrow (not already scheduled today) are flagged.
  const tomorrow = addDaysISO(today, 1);
  const upcomingTomorrow = useMemo(
    () =>
      habits.filter(
        (h) =>
          h.hijri_schedule &&
          scheduledOn(h, tomorrow, hijriOffset) &&
          !scheduledOn(h, today, hijriOffset),
      ),
    [habits, tomorrow, today, hijriOffset],
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
    // position to inherit. An anchored one previews its day-order slot — just after the last
    // populated block of an earlier-or-same band, mirroring lib/moments.dayOrderPlacement, so
    // the card doesn't jump when its first member lands; anything else holds the end of the
    // list. A stack whose members are merely hidden by the day filter stays hidden, as before —
    // the distinction is drawn against ALL habits, not just the day's.
    const stacksWithMembers = new Set<string>();
    for (const h of habits) if (h.stack_id) stacksWithMembers.add(h.stack_id);
    const sortedBlocks = [...out].sort((a, b) => a.sortKey - b.sortKey);
    for (const s of stacks) {
      if (stacksWithMembers.has(s.id)) continue;
      const band = momentBand(momentOf(s));
      let sortKey = Number.MAX_SAFE_INTEGER;
      if (band) {
        const myRank = DAY_PARTS.indexOf(band);
        let lastEarlier: Entry | null = null;
        let firstLater: Entry | null = null;
        for (const e of sortedBlocks) {
          if (e.type !== 'stack') continue;
          const eBand = momentBand(momentOf(e.stack));
          if (!eBand) continue;
          if (DAY_PARTS.indexOf(eBand) <= myRank) lastEarlier = e;
          else if (!firstLater) firstLater = e;
        }
        if (lastEarlier) sortKey = lastEarlier.sortKey + 0.5;
        else if (firstLater) sortKey = firstLater.sortKey - 0.5;
      }
      out.push({ type: 'stack', stack: s, members: [], sortKey });
    }
    return out.sort((a, b) => a.sortKey - b.sortKey);
  }, [visibleHabits, habits, stacks]);

  // The live day-cycle chapter (updates only at real transitions — ~4× a day, never per minute).
  // The FIRST *open* stack in list order whose moment lives in the current band gets its emblem
  // lit, and only on the real today — a past day has no "now". When that stack seals, the light
  // passes to the next open stack of the band (the day progressing through its stacks). Sky
  // moments also get the band's closing time ("until 21:47"), so the lighting explains itself;
  // prayer moments never carry a clock (the no-prayer-times rule). Friday moments (Jumuʿah)
  // light by weekday, all day, independent of the hourly cursor.
  const { dayPart, partEndsAt, displayDateISO } = useSunCycle();
  const inBand = (e: Entry): e is Entry & { type: 'stack' } =>
    e.type === 'stack' && momentBand(momentOf(e.stack)) === dayPart;
  // Prefer a populated, still-open stack (the light passes on seal); fall back to any band
  // match so a lone empty card can still invite. All-sealed ends dark either way (the card
  // itself suppresses the light once complete).
  const sunEntry = isToday
    ? (entries.find((e) => inBand(e) && e.members.length > 0 && !isStackComplete(e.members, completed, skipped)) ??
      entries.find(inBand))
    : undefined;
  const sunStackId = sunEntry && sunEntry.type === 'stack' ? sunEntry.stack.id : null;
  const chapterUntil = partEndsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fridayToday = isToday && localDate(today).getDay() === 5;
  const stackLit = (stack: HabitStack) => {
    if (stack.id === sunStackId) return true;
    const m = momentOf(stack);
    return !!m && !!MOMENTS[m].friday && fridayToday;
  };
  const stackUntil = (stack: HabitStack) => {
    if (stack.id !== sunStackId) return undefined;
    const m = momentOf(stack);
    return m && MOMENTS[m].until ? chapterUntil : undefined;
  };

  const canGoBack = viewDate > minViewDate;
  const canGoForward = viewDate < today;

  const stepViewDate = useCallback(
    (delta: number) => {
      if ((delta < 0 && !canGoBack) || (delta > 0 && !canGoForward)) return;
      // A discrete step through the day series — the same `selection` semantic as tapping a
      // day cell on Progress, so moving through time feels identical on both screens.
      haptics.selection();
      setViewDate(addDaysISO(viewDate, delta));
    },
    [canGoBack, canGoForward, setViewDate, viewDate],
  );

  const openEditor = useCallback(
    (habit: Habit) => router.push({ pathname: '/habits/editor', params: { id: habit.id } }),
    [router],
  );

  // A row's leading swipe (or its screen-reader "View insights" action) → that habit's Insights.
  const openStats = useCallback(
    (habit: Habit) => router.push({ pathname: '/habits/stats', params: { habitId: habit.id } }),
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
      const habit = habits.find((h) => h.id === habitId);
      const restore = placementToRestore(habits, habitId);
      // Moving a stack's last member OUT deletes the emptied source stack, so this Undo can't
      // just move the habit back (moveHabit's stale-target guard would silently no-op on the
      // vanished id) — it recreates the stack around the habit instead, mirroring
      // removeFromStack's Undo (a fresh id: nothing references the old one).
      const sourceStack = habit?.stack_id ? stacks.find((s) => s.id === habit.stack_id) : undefined;
      const wasOnlyMember =
        !!sourceStack && habits.filter((h) => h.stack_id === sourceStack.id).length === 1;
      haptics.added();
      void moveHabit(habitId, { toStackId: stackId });
      if (!stack || !restore) return;
      showToast(`Added to ${stack.name}`, 'success', {
        label: 'Undo',
        onPress: () => {
          if (wasOnlyMember) void createStack(sourceStack.name, [habitId], { moment: momentOf(sourceStack) });
          else void moveHabit(habitId, restore);
        },
      });
    },
    [habits, stacks, moveHabit, createStack, showToast],
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
          if (wasOnlyMember) void createStack(stack.name, [habit.id], { moment: momentOf(stack) });
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
      // A row whose insert is still in flight has no server id to group: createStack would
      // filter the temp id and leave a one-member "stack", and the Undo's captured order
      // (holding the temp id) would no-op after the temp→real swap. Bail — the rows stay put,
      // and the merge works the moment the insert lands. (Every other mutation guards temp
      // ids the same way.)
      if (draggedId.startsWith('temp-') || targetId.startsWith('temp-')) return;
      const prevOrder = flattenUnits(buildUnits(habits));
      haptics.added();
      // Pre-mint the stack id and mark it coalescing BEFORE createStack stamps it into state, so the
      // card animates its spring-in on its very first mount (only this card — not every card on load).
      const stackId = newId();
      setCoalescingStackId(stackId);
      const created = await createStack(defaultStackName(stacks), [targetId, draggedId], { stackId });
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
      const visibleMemberIds =
        stackEntry && stackEntry.type === 'stack' ? stackEntry.members.map((m) => m.id) : [];
      const fullMemberIds = habits
        .filter((h) => h.stack_id === stackId)
        .sort((a, b) => a.position - b.position)
        .map((h) => h.id);
      const index = fullMemberIndexForVisibleDrop(visibleMemberIds, fullMemberIds, habitId, visibleIndex);
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
          {isToday ? <HijriDateLine iso={displayDateISO} /> : null}
          {/* Directly under the Hijri line, so the two calendar whispers read as one almanac. */}
          {isToday && upcomingTomorrow.length > 0 ? <UpcomingHint habits={upcomingTomorrow} /> : null}
          <ErrorBanner message={error} onDismiss={dismissError} style={styles.banner} />
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
              contentBottomInset={LIST_BOTTOM_INSET}
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
              <DragGrid style={styles.gridBreath}>
                {entries.map((entry, index) =>
                  entry.type === 'stack' ? (
                    <DraggableEntry
                      key={`stack-${entry.stack.id}`}
                      entryKey={`stack:${entry.stack.id}`}
                      index={index}
                      kind="stack"
                      stackId={entry.stack.id}
                      // The empty "Add your first habit" card holds the list's end and has no
                      // unit in the order math — every drop of it would snap back, so don't
                      // offer the lift. (It still accepts habits dropped ONTO it, as always.)
                      draggable={entry.members.length > 0}>
                      <CoalesceIn active={coalescingStackId === entry.stack.id}>
                        <StackCard
                          // Remount on a day-step: a stack already done on the newly-viewed day
                          // is born collapsed (a quiet grey bar) instead of animating the in-day
                          // seal fold open→shut. The mount path is flash-free either way; an
                          // in-day seal keeps the same key, so its fold still plays.
                          key={viewDate}
                          stack={entry.stack}
                          members={entry.members}
                          completed={completed}
                          skipped={skipped}
                          counts={counts}
                          onToggle={toggleHabit}
                          onAdjust={adjustHabitCount}
                          onSkip={skipHabit}
                          onEdit={openEditor}
                          onStats={openStats}
                          onDelete={deleteHabit}
                          onEditStack={openStackActions}
                          onRemoveFromStack={removeFromStack}
                          onMove={moveStackForA11y}
                          onMoveHabit={moveRowForA11y}
                          onAddHabits={openAddHabits}
                          isCurrentChapter={stackLit(entry.stack)}
                          currentChapterUntil={stackUntil(entry.stack)}
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
                        onStats={openStats}
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
                  stackLit={stackLit}
                  stackUntil={stackUntil}
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
  stackLit,
  stackUntil,
}: {
  dragEntryKey: string | null;
  entries: Entry[];
  completed: Set<string>;
  skipped: Set<string>;
  counts: Map<string, number>;
  /** The screen's lighting rules, shared so the ghost carries the lit emblem and its "until"
   *  caption unchanged (it mounts at rest — lifting a card never replays the lighting). */
  stackLit: (stack: HabitStack) => boolean;
  stackUntil: (stack: HabitStack) => string | undefined;
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
          onStats={noop}
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
          onStats={noop}
          onDelete={noop}
          onEditStack={noop}
          onRemoveFromStack={noop}
          isCurrentChapter={stackLit(entry.stack)}
          currentChapterUntil={stackUntil(entry.stack)}
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
          onStats={noop}
          onDelete={noop}
          standalone
        />
      )}
    </DragGhost>
  );
}

const noop = () => {};

/**
 * The whisper of a Hijri date under the large "Today" title — the calendar the app is named
 * for, finally on its main screen. It follows the ISLAMIC day, which begins at sunset: at the
 * real local Maghrib the date quietly turns with the darkening sky (`useSunCycle`'s
 * `displayDateISO` — display only; the tracking day stays midnight-bound). Never uppercased
 * (casing mangles the diacritics), hidden on runtimes without the Islamic calendar, and shown
 * only on the real today — a stepped-back day is a records view with no "now" in it.
 */
function HijriDateLine({ iso }: { iso: string }) {
  const parts = hijriParts(iso);
  if (!parts) return null;
  const label = `${parts.day} ${parts.monthName} ${parts.year}`;
  return (
    <ThemedText
      type="almanac"
      themeColor="textSecondary"
      style={styles.hijriLine}
      accessibilityLabel={`Hijri date: ${label}`}>
      {label}
    </ThemedText>
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
        // Disabled speaks the disabled vocabulary (textDisabled, like a maxed stepper "+") —
        // textSecondary is a reading tone, and a dead control must not outrank live metadata.
        color={canGoBack ? theme.accent : theme.textDisabled}
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

/**
 * A quiet "the night before" line listing Hijri acts that begin tomorrow. Read-only, so it
 * wears the almanac's reading tone (the Hijri line's family), not the accent-pill costume —
 * that dress is the checklist's "tappable" vocabulary, and a notice must not promise a tap.
 */
function UpcomingHint({ habits }: { habits: Habit[] }) {
  const theme = useTheme();
  const label = habits.length === 1 && habits[0] ? habits[0].name : `${habits.length} Sunnah acts`;
  return (
    <View accessibilityRole="text" accessibilityLabel={`Tomorrow: ${label}`} style={styles.almanacLine}>
      <AppIcon name="moon" size={14} color={theme.textSecondary} />
      <ThemedText type="small" numberOfLines={1} themeColor="textSecondary" style={styles.hintText}>
        Tomorrow · {label}
      </ThemedText>
    </View>
  );
}

/**
 * The one-shot habit-stacking teaching pill — the strip's one accent pill, the tappable
 * costume the read-only almanac lines deliberately don't wear: it names the gesture (the
 * app's only invisible affordance) and opens the short habit-stacking guide for the why.
 * Gated by the caller until the first stack ever exists.
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
        { backgroundColor: theme.accentSubtle },
        pressed && { opacity: Pressed.dim },
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
  // Sits directly under the collapsing large title, aligned to the banner/list margin — a
  // subtitle, not a section: no uppercase, no extra weight.
  hijriLine: { marginHorizontal: Spacing.three, marginTop: Spacing.one, marginBottom: Spacing.one },
  // A read-only almanac whisper under the Hijri date — same type, tone, and left edge, so
  // the calendar lines read as one family on one meridian.
  almanacLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.one,
    marginBottom: Spacing.one,
  },
  // The strip's one accent pill — the tappable stacking hint. Button radius (not control)
  // for a 44pt tappable surface: the rounder corner keeps kinship with the cards, and the
  // minHeight meets the tap target.
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.one,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
  },
  hintText: { flex: 1 },
  listContent: {
    paddingBottom: LIST_BOTTOM_INSET,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  // One deliberate zone break between the almanac strip and the day's checklist — the strip
  // keeps its tight 4pt beats internally; the sky breathes at this single 16pt step.
  gridBreath: { paddingTop: Spacing.three },
  // Only when the list is empty: match the top offset AppScreen gives the Progress empty state
  // (its content has paddingTop: Spacing.two), so the two tabs' empty moons align pixel-for-pixel
  // instead of jumping a notch when you switch between them. The populated list keeps its flush top.
  emptyTop: { paddingTop: Spacing.two },
});
