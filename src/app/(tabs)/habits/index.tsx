import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import { ActRow } from '@/components/act-row';
import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { BrowseHabitsButton } from '@/components/browse-habits-button';
import { CheckInSection } from '@/components/check-in-section';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { ExchangeSection } from '@/components/exchange-section';
import { DragGhost, DragGrid, DraggableEntry, HabitDragProvider } from '@/components/habit-drag';
import { HabitSection } from '@/components/habit-section';
import { HabitsSkeleton } from '@/components/habits-skeleton';
import { HeaderActions, HeaderIconButton } from '@/components/header-icon-button';
import { ManageRow } from '@/components/manage-row';
import { MoonEmblem } from '@/components/ornament/moon-emblem';
import { SectionLabel } from '@/components/section-label';
import { StackCard } from '@/components/stack-card';
import { Surface } from '@/components/surface';
import { TaskSection } from '@/components/task-section';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { WeekBar } from '@/components/week-bar';
import { Icons } from '@/constants/icons';
import { MaxContentWidth, ScrollBottomInset, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useDayRecord } from '@/hooks/use-day-record';
import { useGoals } from '@/hooks/use-goals';
import { type Habit, type HabitStack, useHabits } from '@/hooks/use-habits';
import { usePlans } from '@/hooks/use-plans';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useStackActions } from '@/hooks/use-stack-actions';
import { useSunCycle } from '@/hooks/use-sun-cycle';
import { useTasks } from '@/hooks/use-tasks';
import { useTheme } from '@/hooks/use-theme';
import { tomorrowLine } from '@/lib/almanac';
import { askingGoals, visibleCheckIns } from '@/lib/check-ins';
import { addDaysISO, dayTitle, localDate, scheduledOn } from '@/lib/dates';
import {
  buildUnits,
  flattenUnits,
  fullMemberIndexForVisibleDrop,
  moveUnit,
  placementToRestore,
  resolvableAnchor,
  type OrderMeta,
} from '@/lib/drag-order';
import { isExchange } from '@/lib/exchange';
import { haptics } from '@/lib/haptics';
import { MOMENTS, momentBand, momentOf } from '@/lib/moments';
import { type Plan, planPicks } from '@/lib/plans';
import { usePreference } from '@/lib/preferences';
import { isStackComplete } from '@/lib/progress';
import { DAY_PARTS } from '@/lib/sun';
import { openTitlesOn, type Task } from '@/lib/tasks';

// The scroll's bottom inset — one constant shared by the layout and the drag layer's
// auto-scroll clamp, so the two can never drift apart. Spacing.five (not four): the list
// ends on a deliberate rest where the full sky reappears, completing the step scale
// (card gap 8 → zone break 16 → closing exhale 32).
const LIST_BOTTOM_INSET = ScrollBottomInset + Spacing.five;

// The day's vertical rhythm, in two numbers — every section caption takes one of them, so no
// section can drift from its neighbours.
//
//   LEAD  — the first section under the header. It follows the title (and, once, the anchoring
//           card), not another unit, so it takes the middle step.
//   BREAK — between two sections. The widest step in the 8/16/32 scale, because what follows is
//           not another card in the same sequence but a different unit of tracking, with its own
//           caption. (EXCHANGES already claimed this; TO DO and STACKS were on 8 and 16, which is
//           what made the day read as three loosely-related lists rather than one.)
const SECTION_LEAD = Spacing.three;
const SECTION_BREAK = Spacing.five;

/** The header names one day at a time, picked from a month grid — so it takes the bare weekday for
 *  the last week and no year (the picker only reaches thirty days back, so there is never another
 *  year to tell this one from). */
function viewDateTitle(viewDate: string, today: string): string {
  return dayTitle(viewDate, today, { weekday: 'long' });
}

/** A card of the stacks grid: a stack and the acts it has due. The habits that live in no stack,
 *  and the exchanges, are sections of their own below the grid rather than entries in it. */
type Entry = { stack: HabitStack; members: Habit[]; sortKey: number };

type StackEntryProps = {
  entry: Entry;
  index: number;
  completed: Set<string>;
  skipped: Set<string>;
  settling: boolean;
  onSeal: (stackId: string) => void;
  onUnseal: (stackId: string) => void;
  onToggleAct: (habit: Habit) => void;
  onAct: (habit: Habit) => void;
  onEditStack: (stackId: string) => void;
  onMove: (stackId: string, delta: -1 | 1) => void;
  onMoveHabit: (habit: Habit, delta: -1 | 1) => void;
  onAddHabits: (stackId: string) => void;
  expanded: boolean;
  onSetExpanded: (stackId: string, expanded: boolean) => void;
  isCurrentChapter: boolean;
  currentChapterUntil: string | undefined;
};

function StackEntryBase({
  entry,
  index,
  completed,
  skipped,
  settling,
  onSeal,
  onUnseal,
  onToggleAct,
  onAct,
  onEditStack,
  onMove,
  onMoveHabit,
  onAddHabits,
  expanded,
  onSetExpanded,
  isCurrentChapter,
  currentChapterUntil,
}: StackEntryProps) {
  return (
    <DraggableEntry
      entryKey={`stack:${entry.stack.id}`}
      index={index}
      stackId={entry.stack.id}
      // The empty "Add your first act" card holds the list's end and has no unit in the order
      // math — every drop of it would snap back, so don't offer the lift. It still accepts acts.
      draggable={entry.members.length > 0}>
      <StackCard
        stack={entry.stack}
        members={entry.members}
        completed={completed}
        skipped={skipped}
        settling={settling}
        onSeal={onSeal}
        onUnseal={onUnseal}
        onToggleAct={onToggleAct}
        onAct={onAct}
        onEditStack={onEditStack}
        onMove={onMove}
        onMoveHabit={onMoveHabit}
        onAddHabits={onAddHabits}
        expanded={expanded}
        onSetExpanded={onSetExpanded}
        isCurrentChapter={isCurrentChapter}
        currentChapterUntil={currentChapterUntil}
      />
    </DraggableEntry>
  );
}

/**
 * The compiler cannot infer that replacing the day's completed/skipped Sets is irrelevant to a
 * stack whose own member ids did not change. Keep that semantic boundary around the drag wrapper:
 * otherwise ticking one loose act rebuilds every card's gesture subtree before StackCard's own
 * membership-aware memo gets a chance to reject the update.
 */
const StackEntry = memo(StackEntryBase, (prev, next) => {
  if (
    prev.entry !== next.entry ||
    prev.index !== next.index ||
    prev.settling !== next.settling ||
    prev.onSeal !== next.onSeal ||
    prev.onUnseal !== next.onUnseal ||
    prev.onToggleAct !== next.onToggleAct ||
    prev.onAct !== next.onAct ||
    prev.onEditStack !== next.onEditStack ||
    prev.onMove !== next.onMove ||
    prev.onMoveHabit !== next.onMoveHabit ||
    prev.onAddHabits !== next.onAddHabits ||
    prev.expanded !== next.expanded ||
    prev.onSetExpanded !== next.onSetExpanded ||
    prev.isCurrentChapter !== next.isCurrentChapter ||
    prev.currentChapterUntil !== next.currentChapterUntil
  ) {
    return false;
  }
  return next.entry.members.every(
    (member) =>
      prev.completed.has(member.id) === next.completed.has(member.id) &&
      prev.skipped.has(member.id) === next.skipped.has(member.id),
  );
});

/** The starting fold state of every day: all shut. Hoisted so a day-step reads one stable
 *  identity rather than minting an empty Set per render. */
const NOTHING_EXPANDED: ReadonlySet<string> = new Set();

export default function HabitsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const hijriOffset = usePreference('hijriOffset');
  const {
    habits,
    stacks,
    completed,
    skipped,
    loading,
    completionsLoading,
    error,
    today,
    viewDate,
    isToday,
    sealStack,
    unsealStack,
    toggleAct,
    toggleLoose,
    moveHabit,
    createStack,
    reorderHabits,
    dismissError,
    refresh,
    reload,
  } = useHabits();
  // The day's one-off things. Their own provider and their own table — a task earns no degrees
  // (see lib/tasks.ts), so nothing about it reaches the progress math.
  const {
    tasks,
    createTask,
    toggleTask,
    renameTask,
    deleteTask,
    error: taskError,
    dismissError: dismissTaskError,
    refresh: refreshTasks,
    scheduledPlans,
    openTasks,
  } = useTasks();
  // What you meant to do before it had a day. Read here only for the shortcut inside the to-do
  // field; the list itself is a place you go, behind the "+".
  const { plans } = usePlans();
  // The goals, only for what they are asking today. Deliberately the raw rows and not
  // `useProgress`: whether a check-in is due needs a cadence and a list of readings, and pulling
  // in the whole completion record to answer that would make the day pay for the goals screen.
  const { goals, checkIns, refresh: refreshGoals, error: goalsError, dismissError: dismissGoalsError } = useGoals();
  // Each day's completion, for the week bar. Re-read with the day itself, below.
  const { refresh: refreshDays } = useDayRecord();
  // "+ → Task" lands back here with this set, rather than pushing another form: a task is a line
  // you type, so the field is the row it becomes. Cleared the moment it is honoured.
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const clearCompose = useCallback(() => router.setParams({ compose: undefined }), [router]);
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
      void refreshTasks();
      // A cadence set from the "+" sheet lands while this screen is behind a modal, so the day has
      // to re-read on the way back: `useGoals` is a provider, but the modal's write does not pass through this render.
      void refreshGoals();
      // The week's orbits: a reset from Settings empties every day, not only this one.
      void refreshDays();
    }, [refresh, refreshTasks, refreshGoals, refreshDays]),
  );

  // The scroll container ref hands auto-scroll-while-dragging to the drag layer.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // The composer opens in the TO DO card, which sits at the very top of the list — so a reader who
  // was scrolled down when they asked for it ("+ → To-do") got a focused field, and the keyboard,
  // somewhere off the top of the screen: the tap read as nothing having happened, and the first
  // thing typed landed in a row nobody could see. Carry the top back with the request.
  //
  // Keyed on `compose` rather than fired from the tap, because the tap happens on another screen
  // (the Add sheet dismisses back to here). It runs once per request — `clearCompose` returns the
  // param to undefined when the field closes, so the next one arms it again.
  useEffect(() => {
    if (compose !== 'task') return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [compose, scrollRef]);

  // Pull-to-refresh. Both `refresh`es are silent (no spinner); the RefreshControl owns the
  // indicator. The catalog rides along here too — it otherwise only refetches on cold app
  // launch, so a pull on Today is the one in-session way to retry it (e.g. after a network
  // blip at launch silently left Discover on a stale snapshot).
  const { refresh: refreshCatalog } = useCatalog();
  const { refreshControl } = usePullToRefresh(() => Promise.all([
    refresh(), refreshTasks(), refreshGoals(), refreshCatalog(), refreshDays(),
  ]));

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

  // What tomorrow is holding: the acts whose schedule begins then, and the to-dos deliberately put
  // there from a plan. The second is the only place one of those can be seen before it arrives.
  const tomorrowHint = useMemo(
    () => tomorrowLine(upcomingTomorrow.map((h) => h.name), openTitlesOn(openTasks, tomorrow)),
    [upcomingTomorrow, openTasks, tomorrow],
  );

  // The day's habits that belong to no stack — their own section, ticked one at a time.
  //
  // Filtered by the day like every other unit. They used to be read off the FULL habits list, so an
  // unanchored habit appeared on every date including ones it wasn't scheduled for — defensible
  // while it was a migration prompt ("these are invisible otherwise"), wrong now that it is a
  // section of things the day is actually asking for.
  //
  // Exchanges are stackless too but by a different design — their anchor is an urge rather than a
  // moment — so they keep their own section below; folding them in here would offer them for
  // anchoring, and accepting would drop one into a stack whose seal would swallow its own tick.
  const looseHabits = useMemo(
    () => visibleHabits.filter((h) => !h.stack_id && !isExchange(h)).sort((a, b) => a.position - b.position),
    [visibleHabits],
  );

  // The day's exchanges, in creation order. They sit below the stacks in their own section rather
  // than among them: a stack has a place in the day's order because its cue does, and an urge has
  // no hour to be filed under.
  const exchanges = useMemo(
    () => visibleHabits.filter(isExchange).sort((a, b) => a.position - b.position),
    [visibleHabits],
  );

  // Fold the day's acts into their stacks' cards, each sitting where its earliest act sits.
  const entries = useMemo<Entry[]>(() => {
    const stackById = new Map(stacks.map((s) => [s.id, s]));
    const membersByStack = new Map<string, Habit[]>();
    const out: Entry[] = [];
    for (const h of visibleHabits) {
      const stack = h.stack_id ? stackById.get(h.stack_id) : undefined;
      if (!stack) continue; // an orphan — it has its own section below, not a card of its own
      const arr = membersByStack.get(stack.id);
      if (arr) arr.push(h);
      else membersByStack.set(stack.id, [h]);
    }
    for (const [stackId, members] of membersByStack) {
      const sorted = [...members].sort((a, b) => a.position - b.position);
      const first = sorted[0];
      if (!first) continue; // a populated stack always has ≥1 member, but keep the index access honest
      out.push({ stack: stackById.get(stackId)!, members: sorted, sortKey: first.position });
    }
    // A stack with no acts at all ("Your own stack", waiting on its first act) has no
    // position to inherit. An anchored one previews its day-order slot — just after the last
    // populated block of an earlier-or-same band, mirroring lib/moments.dayOrderPlacement, so
    // the card doesn't jump when its first act lands; anything else holds the end of the
    // list. A stack whose acts are merely hidden by the day filter stays hidden, as before —
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
          const eBand = momentBand(momentOf(e.stack));
          if (!eBand) continue;
          if (DAY_PARTS.indexOf(eBand) <= myRank) lastEarlier = e;
          else if (!firstLater) firstLater = e;
        }
        if (lastEarlier) sortKey = lastEarlier.sortKey + 0.5;
        else if (firstLater) sortKey = firstLater.sortKey - 0.5;
      }
      out.push({ stack: s, members: [], sortKey });
    }
    return out.sort((a, b) => a.sortKey - b.sortKey);
  }, [visibleHabits, habits, stacks]);

  // The live day-cycle chapter (updates only at real transitions — ~4× a day, never per minute).
  // The FIRST *open* stack in list order whose moment lives in the current band is the day's
  // current one, and only on the real today — a past day has no "now". When that stack seals, the
  // mark passes to the next open stack of the band (the day progressing through its stacks). Sky
  // moments carry the band's closing time in the header ("until 21:47"); prayer moments never
  // carry a clock (the no-prayer-times rule). Friday moments (Jumuʿah) count as current by
  // weekday, all day, independent of the hourly cursor.
  const { dayPart, partEndsAt } = useSunCycle();
  const inBand = (e: Entry) => momentBand(momentOf(e.stack)) === dayPart;
  // Prefer a populated, still-open stack (the light passes on seal); fall back to any band
  // match so a lone empty card can still invite. All-sealed ends dark either way (the card
  // itself suppresses the light once complete).
  const sunEntry = isToday
    ? (entries.find((e) => inBand(e) && e.members.length > 0 && !isStackComplete(e.members, completed, skipped)) ??
      entries.find(inBand))
    : undefined;
  const sunStackId = sunEntry?.stack.id ?? null;
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

  // Whether the TO DO card is ON SCREEN — which is not the same as whether there are to-dos.
  // `TaskSection` also renders for a composer that has been asked for, and "+ → To-do" is the
  // documented way to write the very first one: on a day that is otherwise empty that opens a card
  // with a live field in it. Read as `tasks.length > 0`, the day then believed nothing was there
  // and put the "Anchor your first stack" invitation directly under the field the keyboard was
  // already up for — two first steps offered at once, one of them ignoring the other.
  //
  // The screen can't see the section's own `composing`/`editing`, but it doesn't need to: with no
  // to-dos there is nothing to edit and nothing to type into until this param opens the field, and
  // `onComposeHandled` returns it to undefined the moment the field closes.
  const taskCardShowing = tasks.length > 0 || (isToday && compose === 'task');
  // What the day's goals are asking. Read straight from `useGoals` rather than through
  // `useProgress`: the visibility rule needs only the cadence and the readings, and Today has no
  // business fetching every completion ever written to find out whether to draw one row.
  // `askingGoals` is not optional here: a goal that has been set aside or reached asks nothing,
  // and `showsOn` cannot know that — its `Cadenced` shape has no status in it.
  const checkInEntries = useMemo(
    () => visibleCheckIns(askingGoals(goals), checkIns, viewDate, today),
    [goals, checkIns, viewDate, today],
  );
  // Whether the day holds anything at all. The scroll's `emptyTop` used to key off the stacks
  // alone, so a day with to-dos but no stacks got 8pt of top padding that a day with stacks
  // didn't, while the empty state below correctly stayed away. One predicate, both readers.
  const showEmptyState =
    entries.length === 0 &&
    !taskCardShowing &&
    checkInEntries.length === 0 &&
    looseHabits.length === 0 &&
    exchanges.length === 0;
  // An account that has never made a practice, on a day that is nonetheless not empty.
  //
  // `showEmptyState` above asks whether the day *looks* empty, and treats a single to-do as
  // evidence that the user has begun. It is not: "To-do" is the most familiar noun in the Add
  // sheet to anyone arriving from a reminders app, and choosing it first used to retire the
  // "Anchor your first stack" invitation for good — so the account never met a stack, and never
  // met the guide the stack library opens with, which is where the one rule that makes this app
  // legible ("one tap seals the whole stack") is taught. Since there are no habits and no stacks,
  // the only things the day can be holding here are to-dos and check-ins.
  const neverStarted = !showEmptyState && habits.length === 0 && stacks.length === 0;
  // Everything the check-in section has to step down from, and everything below it has to step
  // down from in turn.
  const checkInCardShowing = checkInEntries.length > 0;
  // Whether anything at all precedes a given section, so each one takes the same step from what
  // is above it. Spelled once and threaded down the list rather than restated per section with
  // one more clause each time — which is how the fourth section would have got it wrong.
  const gapAfter = (anythingAbove: boolean) => (anythingAbove ? SECTION_BREAK : SECTION_LEAD);


  // An act's `⋯` opens its sheet — skip today, stats, edit, move. Its *tap* ticks it (below):
  // the row is a checkbox, so the things you can do TO an act live behind the trailing door the
  // rest of the day already uses for exactly that.
  const openAct = useCallback(
    (habit: Habit) => router.push({ pathname: '/habits/act-actions', params: { habitId: habit.id } }),
    [router],
  );

  // Ticking one act of a stack. Stable across renders like `tickLoose` below, or every act row's
  // memo comparator would fail on each of the screen's many re-renders.
  const tickAct = useCallback((habit: Habit) => void toggleAct(habit.id), [toggleAct]);

  // A check-in is answered with a number, so the row opens a field rather than ticking. The viewed
  // day rides along: stepping back to a day and correcting what was recorded then has to write to
  // that day, not to today.
  const openCheckIn = useCallback(
    (goalId: string) => router.push({ pathname: '/habits/check-in', params: { goalId, day: viewDate } }),
    [router, viewDate],
  );

  // One tick for both stackless sections — a habit with no stack and an exchange are the same
  // gesture over the same write. Stable across renders so their rows' memo comparators hold; a
  // fresh arrow each render would defeat them on every day-step and every drag settle.
  const tickLoose = useCallback((habit: Habit) => void toggleLoose(habit.id), [toggleLoose]);

  // The same discipline for the task rows: the composer re-renders this screen on every keystroke,
  // and an arrow minted here would rebuild every row in the card behind it.
  // Three is a shortcut; a fourth would be the list, which is a place you go rather than a strip
  // under a field.
  const offeredPlans = useMemo(() => planPicks(plans, scheduledPlans, today, 3), [plans, scheduledPlans, today]);

  const addTask = useCallback((title: string) => void createTask(title), [createTask]);
  // A plan writes its title onto the viewed day and keeps its id on the row, so the plan can say
  // afterwards where the to-do went. The field stays open, the way it does after Return — and the
  // plan drops out of the strip on its own, since `planPicks` stops offering one already on today.
  const addFromPlan = useCallback((plan: Plan) => void createTask(plan.title, { planId: plan.id }), [createTask]);
  const tickTask = useCallback((task: Task) => void toggleTask(task.id), [toggleTask]);
  const rewriteTask = useCallback((task: Task, title: string) => void renameTask(task.id, title), [renameTask]);
  const removeTask = useCallback((task: Task) => void deleteTask(task.id), [deleteTask]);

  // The stack card's "Manage stack" door opens its sheet (add acts / stats / edit / delete) — one
  // bottom sheet on both platforms.
  const openStackActions = useStackActions();

  // The empty stack card's "Add your first act" row → the Add screen scoped to that stack
  // (presets, "your habits", and "create your own" all land inside it).
  const openAddHabits = useCallback(
    (stackId: string) => router.push({ pathname: '/habits/discover', params: { stackId } }),
    [router],
  );

  // Which stack cards the reader has unfolded, by stack id. The stack is the only thing on the day
  // with hidden content — its sequence — and therefore the only thing wearing a chevron; the loose
  // rows and the exchanges below carry a `⋯` straight to their sheet instead. (They briefly shared
  // this set, back when they folded onto a schedule line and a manage door.) Every card is born
  // folded, so the day opens as a list of names and unfolding is an act of reading, not of
  // operating the card.
  //
  // Owned here rather than in the card because the drag layer renders a SECOND StackCard as the
  // floating ghost, and its height must match the original's exactly (`ghostH`/`slotSize` are
  // measured from the original at lift).
  //
  // Scoped to `viewDate` and *derived* rather than reset: the day can advance without going
  // through the picker — the midnight rollover in use-habits calls `setViewDateState` itself —
  // and an imperative reset would miss that. Deliberately not persisted: born folded is the design.
  const [expandedState, setExpandedState] = useState<{ day: string; ids: ReadonlySet<string> }>(() => ({
    day: viewDate,
    ids: NOTHING_EXPANDED,
  }));
  const expandedIds = expandedState.day === viewDate ? expandedState.ids : NOTHING_EXPANDED;
  const setCardExpanded = useCallback(
    (cardId: string, next: boolean) => {
      setExpandedState((prev) => {
        const ids = prev.day === viewDate ? prev.ids : NOTHING_EXPANDED;
        // Idempotent: the seal's auto-fold fires at cards that are already folded.
        if (ids.has(cardId) === next) return prev;
        const nextIds = new Set(ids);
        if (next) nextIds.add(cardId);
        else nextIds.delete(cardId);
        return { day: viewDate, ids: nextIds };
      });
    },
    [viewDate],
  );

  const { show: showToast } = useToast();

  // Commit "move into this stack" (the drag's drop-onto-a-card and the picker sheet both land
  // here via moveHabit). The restore is captured BEFORE the move so the toast's Undo puts the act
  // back exactly where it was (user control & freedom — a slip is one tap from undone).
  const addHabitToStack = useCallback(
    (habitId: string, stackId: string) => {
      const stack = stacks.find((s) => s.id === stackId);
      const habit = habits.find((h) => h.id === habitId);
      const restore = placementToRestore(habits, habitId);
      // Moving a stack's last act OUT deletes the emptied source stack, so this Undo can't just
      // move it back (moveHabit's stale-target guard would silently no-op on the vanished id) —
      // it recreates the stack around the act instead (a fresh id: nothing references the old one).
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

  // The key being dragged (ghost source), or null at rest. While a drag is live the scroll is
  // frozen so a vertical drag doesn't fight the list (auto-scroll drives it instead).
  const [dragEntryKey, setDragEntryKey] = useState<string | null>(null);
  const isDragging = dragEntryKey !== null;
  const onDragActive = useCallback((key: string | null) => setDragEntryKey(key), []);

  // The rendered entry order, mirrored into the drag layer's registry (keys in render order).
  const orderMeta = entries.map((entry): OrderMeta => ({
    key: `stack:${entry.stack.id}`,
    stackId: entry.stack.id,
  }));

  // stackId → its visible acts' keys in sequence — the inner lists an in-card reorder drags
  // within (the act analogue of `orderMeta`; day-hidden acts aren't rendered, so aren't here).
  const memberOrder: Record<string, string[]> = {};
  for (const entry of entries) {
    memberOrder[entry.stack.id] = entry.members.map((m) => `member:${m.id}`);
  }

  // A drop between cards: the card reorders, its acts travelling with it. Only cards reach here —
  // an act dropped in a gap has nowhere to land (a habit lives in a stack or nowhere), and the
  // drag layer floats it home rather than opening a gap it can't honour.
  const onDropBetween = useCallback(
    (draggedKey: string, beforeKey: string) => {
      const anchor = beforeKey === '' ? null : beforeKey;
      const units = buildUnits(habits);
      // The geometry's anchor can name a memberless stack (no unit of its own) — that's not a
      // stale drop, it's the ordinary tail-of-the-day case (an unstarted stack sits at the end of
      // the list). Resolve to the next entry that does have a unit before asking moveUnit.
      const next = moveUnit(units, draggedKey, resolvableAnchor(orderMeta, units, anchor));
      if (next === units) return; // stale anchor — leave the order alone
      haptics.selection();
      void reorderHabits(flattenUnits(next));
    },
    [habits, reorderHabits, orderMeta],
  );

  // A drop onto a glowing stack card: an act from another card joins it.
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
      const visibleMemberIds = entries.find((e) => e.stack.id === stackId)?.members.map((m) => m.id) ?? [];
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
  // can do without the gesture). Steps within the real unit sequence directly — a memberless
  // stack (an "Add your first act" card) has no unit at all, so it's not a stop along the way,
  // the same reason the drag's own between-drop resolves through it via `resolvableAnchor`.
  const moveEntryForA11y = useCallback(
    (entryKey: string, delta: -1 | 1) => {
      const units = buildUnits(habits);
      const at = units.findIndex((u) => u.key === entryKey);
      const targetAt = at === -1 ? -1 : at + delta;
      if (at === -1 || targetAt < 0 || targetAt >= units.length) return; // already at the edge
      // Up: land just before the neighbour. Down: land just after it (before its follower).
      const anchor = delta === -1 ? units[targetAt]!.key : (units[targetAt + 1]?.key ?? null);
      const next = moveUnit(units, entryKey, anchor);
      if (next === units) return;
      haptics.selection();
      void reorderHabits(flattenUnits(next));
      AccessibilityInfo.announceForAccessibility(delta === -1 ? 'Moved up' : 'Moved down');
    },
    [habits, reorderHabits],
  );

  const moveRowForA11y = useCallback(
    (habit: Habit, delta: -1 | 1) => {
      if (!habit.stack_id) return; // an orphan isn't in the list yet — it has no sequence to move in
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
    [habits, moveHabit],
  );

  const moveStackForA11y = useCallback(
    (stackId: string, delta: -1 | 1) => moveEntryForA11y(`stack:${stackId}`, delta),
    [moveEntryForA11y],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: viewDateTitle(viewDate, today),
          headerLargeTitleEnabled: true,
          // The month, one tap above the title. A permanent strip of chevrons, the date and a "Back
          // to today" line used to stand at the top of the list, charging every ordinary day for a
          // backfill that happens occasionally; it went (2026-09-05). The week bar that now opens
          // the list earns its place differently: it shows the week's record every day, and taking
          // you to a day in it is a by-product. This stays the door to the rest of the month.
          //
          // A calendar, not a moon (2026-10-17). The moon was the viewed day's phase, but the app
          // already has its moon, on Progress, and a second one up here read as the same thing
          // twice. The calendar says what the button does; the moons now live INSIDE it, one per
          // day, where they map the Gregorian grid onto the month that matters here.
          headerLeft: () => (
            <HeaderIconButton
              icon={Icons.calendar}
              // The same accent as Add on the other side, so the header's two controls read as a
              // matched pair rather than one control and one label.
              color={theme.accent}
              accessibilityLabel={`Choose a day, showing ${viewDateTitle(viewDate, today)}`}
              onPress={() => router.push('/habits/day-picker')}
            />
          ),
          headerRight: () => (
            <HeaderActions>
              {/* One door to add: the sheet forks to six things you can start, repeating or
                  one-off — hence the bare "Add", which is all this button can honestly promise. */}
              <HeaderIconButton
                icon={Icons.add}
                color={theme.accent}
                accessibilityLabel="Add"
                onPress={() => router.push('/habits/add-menu')}
              />
            </HeaderActions>
          ),
        }}
      />

      {loading ? (
        // The week is up before the day has loaded: it needs only the date, and its orbits fill in
        // when the record lands, so the top of the screen holds still through the load.
        <AppScreen transparent>
          <WeekBar />
          <HabitsSkeleton />
        </AppScreen>
      ) : loadFailed ? (
        <AppScreen transparent centered>
          <EmptyState
            icon="cloudOff"
            title="Could not load your habits"
            // Not `body={error}`: the provider's message opens with this title word for word, and
            // its own advice is the retry right below. The same call the Progress tab makes.
            body="Check your connection, then try again.">
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
          contentContainerStyle={[styles.listContent, showEmptyState && styles.emptyTop]}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={refreshControl}
          scrollEnabled={!isDragging}
          keyboardShouldPersistTaps="handled">
          {/* The week, Saturday to Jumuʿah, each day with its orbit: where the day you are on sits
              among the days around it, and the way to any of them. Above the errors, because it is
              the header's own: it says which day everything under it belongs to. */}
          <WeekBar style={styles.weekBar} />
          {/* Errors first: they are about the day you are looking at, and a line about tomorrow
              is the one thing on the screen that can wait. */}
          <ErrorBanner message={error} onDismiss={dismissError} style={styles.banner} />
          <ErrorBanner message={taskError} onDismiss={dismissTaskError} style={styles.banner} />
          <ErrorBanner message={goalsError} onDismiss={dismissGoalsError} style={styles.banner} />
          {isToday && tomorrowHint ? <UpcomingHint label={tomorrowHint} /> : null}
          {/* The day's one-off things, above the practice: a stack missed today comes round again
              tomorrow, and a prescription not collected simply doesn't. Renders nothing at all
              until there is a list — the way in is the header "+". */}
          <TaskSection
            tasks={tasks}
            topGap={SECTION_LEAD}
            today={today}
            viewDate={viewDate}
            isToday={isToday}
            composeRequested={compose === 'task'}
            onComposeHandled={clearCompose}
            onCreate={addTask}
            planPicks={offeredPlans}
            onPick={addFromPlan}
            onToggle={tickTask}
            onRename={rewriteTask}
            onDelete={removeTask}
          />
          {/* What the goals are asking. Under the errands that expire and above the practice that
              comes round again: a check-in is an ask like a to-do, but it reports on the acts
              rather than competing with them. */}
          <CheckInSection
            entries={checkInEntries}
            topGap={gapAfter(taskCardShowing)}
            today={today}
            onPress={openCheckIn}
          />
          {entries.length === 0 ? (
            // The empty state is for a day with nothing on it at all. Exchanges and tasks count as
            // something: a user who tracks only those has a day, and inviting them to anchor their
            // first stack above their own list would read as if it hadn't registered.
            showEmptyState ? (
              <HabitsEmptyState
                hasHabits={habits.length > 0}
                isToday={isToday}
                onBuild={() => router.push('/habits/stack-new')}
              />
            ) : null
          ) : (
            <>
              {/* The day's two units, each under its own caption: the stacks, then the exchanges
                  below them. Before the label the section stood unnamed while the one beneath it
                  was captioned — which read as if the list were the day and the exchanges an
                  appendix to it. */}
              <SectionLabel
                style={[styles.stacksLabel, { paddingTop: gapAfter(taskCardShowing || checkInCardShowing) }]}>
                Stacks
              </SectionLabel>
              <HabitDragProvider
                scrollRef={scrollRef}
                order={orderMeta}
                memberOrder={memberOrder}
                contentBottomInset={LIST_BOTTOM_INSET}
                onDragActive={onDragActive}
                onDropBetween={onDropBetween}
                onDropInto={onDropInto}
                onDropReorder={onDropReorder}>
                {/* One long-press drag vocabulary (hold ~a beat, then move): a stack card reorders
                    through the gaps as one unit, its acts in tow; an act reorders within its own
                    card, or joins the card it's dropped onto (accent ring). The dragged item floats
                    as a ghost above the grid while its original holds the empty slot. Every one of
                    these has a screen-reader action twin — no capability is gesture-only. */}
                <DragGrid style={styles.gridBreath}>
                  {entries.map((entry, index) => (
                    <StackEntry
                      key={`stack-${entry.stack.id}`}
                      entry={entry}
                      index={index}
                      completed={completed}
                      skipped={skipped}
                      settling={completionsLoading}
                      onSeal={sealStack}
                      onUnseal={unsealStack}
                      onToggleAct={tickAct}
                      onAct={openAct}
                      onEditStack={openStackActions}
                      onMove={moveStackForA11y}
                      onMoveHabit={moveRowForA11y}
                      onAddHabits={openAddHabits}
                      expanded={expandedIds.has(entry.stack.id)}
                      onSetExpanded={setCardExpanded}
                      isCurrentChapter={stackLit(entry.stack)}
                      currentChapterUntil={stackUntil(entry.stack)}
                    />
                  ))}
                  <HabitsDragGhost
                    dragEntryKey={dragEntryKey}
                    entries={entries}
                    completed={completed}
                    skipped={skipped}
                    expandedIds={expandedIds}
                    stackLit={stackLit}
                    stackUntil={stackUntil}
                  />
                </DragGrid>
              </HabitDragProvider>
            </>
          )}
          {/* Below the stacks and outside the drag layer, like the exchanges beneath it: a habit
              with no stack has no slot in the day's order to be dragged into. It comes first of
              the two because it is the ordinary case — an exchange is the special one. */}
          <HabitSection
            habits={looseHabits}
            topGap={gapAfter(entries.length > 0 || taskCardShowing || checkInCardShowing)}
            completed={completed}
            skipped={skipped}
            settling={completionsLoading}
            onToggle={tickLoose}
            onOptions={openAct}
          />
          {/* Below the stacks, and outside the drag layer: an exchange has no slot in the day's
              order to be dragged into, so it is not a unit the grid knows about. */}
          <ExchangeSection
            exchanges={exchanges}
            // A break when something precedes it, the lead when the day is exchanges only.
            topGap={gapAfter(entries.length > 0 || taskCardShowing || checkInCardShowing || looseHabits.length > 0)}
            completed={completed}
            skipped={skipped}
            settling={completionsLoading}
            onToggle={tickLoose}
            onOptions={openAct}
          />
          {/* Last of all, under whatever the day is holding — an offer, not a section of the day,
              so it carries no caption. */}
          {neverStarted ? <AnchorOffer topGap={SECTION_BREAK} /> : null}
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
  expandedIds,
  stackLit,
  stackUntil,
}: {
  dragEntryKey: string | null;
  entries: Entry[];
  completed: Set<string>;
  skipped: Set<string>;
  /** The list's fold state, shared verbatim: the drag math measures the ORIGINAL card's height at
   *  lift, so a ghost that folded differently would be a different size from the hole it left. */
  expandedIds: ReadonlySet<string>;
  /** The screen's "which moment is now" rules, shared so the ghost carries the same "until"
   *  caption as the card it copies. */
  stackLit: (stack: HabitStack) => boolean;
  stackUntil: (stack: HabitStack) => string | undefined;
}) {
  if (!dragEntryKey) return null;
  // A travelling act keeps its own bare look — it is going to another sequence, not becoming a
  // card of its own (there is nowhere outside a stack for it to land).
  if (dragEntryKey.startsWith('member:')) {
    const habitId = dragEntryKey.slice('member:'.length);
    const stack = entries.find((e) => e.members.some((m) => m.id === habitId));
    const member = stack?.members.find((h) => h.id === habitId);
    if (!stack || !member) return null;
    return (
      <DragGhost>
        <Surface>
          <ActRow
            habit={member}
            ordinal={stack.members.filter((m) => !skipped.has(m.id)).findIndex((m) => m.id === habitId) + 1}
            done={completed.has(member.id)}
            skipped={skipped.has(member.id)}
            onToggle={noop}
            onOptions={noop}
          />
        </Surface>
      </DragGhost>
    );
  }
  const entry = entries.find((e) => `stack:${e.stack.id}` === dragEntryKey) ?? null;
  if (!entry) return null;
  return (
    <DragGhost>
      <StackCard
        stack={entry.stack}
        members={entry.members}
        completed={completed}
        skipped={skipped}
        onSeal={noop}
        onUnseal={noop}
        onToggleAct={noop}
        onAct={noop}
        onEditStack={noop}
        expanded={expandedIds.has(entry.stack.id)}
        onSetExpanded={noop}
        isCurrentChapter={stackLit(entry.stack)}
        currentChapterUntil={stackUntil(entry.stack)}
      />
    </DragGhost>
  );
}

const noop = () => {};

/**
 * A quiet "the night before" line: the Hijri acts that begin tomorrow, and any to-do put there
 * from a plan. Read-only, so it wears the almanac's reading tone (the Hijri line's family), not
 * the accent-pill costume — that dress is the checklist's "tappable" vocabulary, and a notice must
 * not promise a tap. What it says is resolved in {@link tomorrowLine}, where the rule has a test.
 */
function UpcomingHint({ label }: { label: string }) {
  const theme = useTheme();
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
 * The first-run invitation in the footer voice, for a day that already has something on it.
 *
 * {@link HabitsEmptyState} below says the same thing full-screen, and can only appear when the day
 * is completely bare. This is the version that can sit under a to-do list — the `ManageRow` idiom,
 * "a footer row that offers rather than demands", in the reading tone rather than the accent one.
 * It points at the ready-made stacks rather than at both doors: a second button would make it a
 * decision, and the whole reason it exists is that the library is where anchoring is explained.
 */
function AnchorOffer({ topGap }: { topGap: number }) {
  const router = useRouter();
  return (
    <View style={[styles.offer, { paddingTop: topGap }]}>
      <Surface>
        <ManageRow
          icon="stack"
          label="Anchor your first stack"
          accessibilityLabel="Anchor your first stack"
          accessibilityHint="Opens the ready-made stacks to choose an anchor."
          onPress={() => router.push('/habits/stack-library')}
        />
      </Surface>
    </View>
  );
}

function HabitsEmptyState({
  hasHabits,
  isToday,
  onBuild,
}: {
  hasHabits: boolean;
  isToday: boolean;
  onBuild: () => void;
}) {
  // A rest day (you have stacks, none fall today) is a calm, action-free "bedtime" note. The
  // brand-new user instead gets the warm moon emblem and the question the whole app turns on.
  if (hasHabits) {
    return (
      <EmptyState
        icon="bedtime"
        title="Nothing scheduled"
        body={isToday ? 'Enjoy your rest day.' : 'Nothing was scheduled for this day.'}
      />
    );
  }
  return (
    // First run asks for an anchor rather than a habit: a new act attached to something you
    // already do every day is the one that survives, and the ready-made stacks are exactly
    // those anchors with a short sequence hung on each.
    <EmptyState
      art={<MoonEmblem />}
      title="Anchor your first stack"
      body={'Attach a short sequence to something you already\u00A0do: waking, a prayer, going to bed.'}>
      {/* The shared "start here" button — one label and one destination for every first run. */}
      <BrowseHabitsButton />
      {/* Names the noun, like every other way in: "your own" alone never said your own *what*. */}
      <AppButton variant="secondary" onPress={onBuild} accessibilityLabel="Create your own stack">
        Your own stack
      </AppButton>
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  // The list is transparent so the fixed sky (rendered behind the stack) shows through it.
  transparent: { backgroundColor: 'transparent' },
  banner: { marginHorizontal: Spacing.three, marginTop: Spacing.two, marginBottom: Spacing.one },
  // On the cards' edges, so its seven columns span exactly the width of the cards below; 8 under
  // the large title, the step AppScreen gives every screen's first content.
  weekBar: { marginHorizontal: Spacing.three, marginTop: Spacing.two },
  // A read-only almanac whisper under the title — the tone and left edge the section captions
  // share, so the strip and the list read on one meridian.
  //
  // That meridian is 32, not 16: a caption gets 16 from its section's inset plus 16 of its own
  // (`SectionLabel`), and this line hung at the card edge instead — one indent left of every
  // caption below it, while its own comment claimed otherwise. `marginLeft` carries the 32 and
  // `marginRight` stays at the card edge, since the line is free to run the full width.
  almanacLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginLeft: Spacing.five,
    marginRight: Spacing.three,
    // 16 above: it follows the week bar the way a section's caption follows what is above it, so
    // it takes the same lead.
    marginTop: SECTION_LEAD,
    marginBottom: Spacing.one,
  },
  hintText: { flex: 1 },
  listContent: {
    paddingBottom: LIST_BOTTOM_INSET,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  // The one caption that isn't inside a 16pt-inset section of its own — the stacks live in the
  // drag grid, which insets its cards itself. Without this padding the caption hung 16 in from the
  // screen edge while TO DO and EXCHANGES hung 32, so the three captions stepped in and out down
  // the day. (Its own `marginLeft: 16` from SectionLabel plus this 16 = the 32 every caption in
  // the app keeps from the card edge.) The top space is set inline, from the day's two constants.
  stacksLabel: { paddingHorizontal: Spacing.three },
  // 8 from the caption to the first card: the same label→card beat the exchanges' section uses,
  // so both captions sit the same distance above what they name.
  //
  // Both ends, deliberately. This overrode only `paddingTop` for a while, which left the grid's own
  // `paddingVertical: 4` on the bottom — so the gap from the last stack card to the next caption
  // was 36 where every other section break is 32, and the day's one visibly odd interval was the
  // one nobody could see the source of.
  gridBreath: { paddingTop: Spacing.two, paddingBottom: 0 },
  // Only when the list is empty: match the top offset AppScreen gives the Progress empty state
  // (its content has paddingTop: Spacing.two), so the two tabs' empty moons align pixel-for-pixel
  // instead of jumping a notch when you switch between them. The populated list keeps its flush top.
  emptyTop: { paddingTop: Spacing.two },
  // The same 16pt gutter `CardSection` reproduces for the sections that sit outside the drag
  // layer, so the offer's card edge lines up with the to-do card it follows.
  offer: { paddingHorizontal: Spacing.three },
});
