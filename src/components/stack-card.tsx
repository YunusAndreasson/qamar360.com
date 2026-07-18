import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { DraggableMemberRow } from '@/components/habit-drag';
import { HabitRow } from '@/components/habit-row';
import { PressableScale } from '@/components/pressable-scale';
import { RowSeparator } from '@/components/row-separator';
import { StackCompleteFlash } from '@/components/stack-complete-flash';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Collapse, Duration } from '@/constants/motion';
import { FontWeight, Pressed, Spacing } from '@/constants/theme';
import type { Habit, HabitStack } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { isStackComplete } from '@/lib/progress';

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
  /** Detach a member back to standalone (the member row's "Remove from stack" swipe). */
  onRemoveFromStack: (habit: Habit) => void;
  /** Screen-reader reorder for the whole stack (Move up / Move down on the header). */
  onMove?: (stackId: string, delta: -1 | 1) => void;
  /** Screen-reader reorder for a member within the stack (forwarded to each row). */
  onMoveHabit?: (habit: Habit, delta: -1 | 1) => void;
  /** Open the stack-scoped Add screen — the empty card's "Add your first habit" row. */
  onAddHabits?: (stackId: string) => void;
  /** This stack is the day's current chapter (its `day_part` matches the real sun's) — the
   *  resting sun glyph shows in the header. Computed once in the screen from `useSunCycle`;
   *  never read from a context here (that would bypass the memo below). */
  isCurrentChapter?: boolean;
};

/**
 * A stack rendered as one logical unit: a titled card holding its member habits in
 * sequence, visually set apart from the rows before and after it. Presentation only —
 * each member is still ticked individually. The header opens the manage menu. In the
 * Today grid the card takes part in the drag vocabulary: hold anywhere on it to lift and
 * reorder the whole stack, hold a member row to pull that habit out, and a loose habit
 * dropped onto the card's body joins the stack (the drag layer draws the accent ring).
 * When a tick resolves every act the stack has due today, its border flashes the "done"
 * tone (see {@link StackCompleteFlash}) with a synced haptic — the group sealing — and
 * then the card folds itself shut into a quiet grey bar: a finished group recedes so the
 * day's remaining work rises. The bar taps open again — the title tap toggles the fold
 * either way (and any stack, done or not, can be tucked away by hand).
 */
function StackCardBase({ stack, members, completed, skipped, counts, onToggle, onAdjust, onSkip, onEdit, onDelete, onEditStack, onRemoveFromStack, onMove, onMoveHabit, onAddHabits, isCurrentChapter }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // The whole group sealed — every act the stack has due today is done. Drives the one-shot border
  // flash, the greyed "done" header tone, and the auto-collapse; the synced completion haptic is
  // fired from the toggle seam in use-habits.
  const stackComplete = isStackComplete(members, completed, skipped);
  // The sun rests here only while the stack is still open: a sealed stack keeps its greyed
  // glyph — the recede is the stronger statement than the visit.
  const sunResident = !!isCurrentChapter && !stackComplete;
  // Any non-empty stack can be folded away by hand; a sealed one folds itself. The empty
  // "Add your first habit" card has nothing to collapse.
  const collapsible = members.length > 0;

  // Born collapsed if the card loads already sealed, so a cold start of a finished stack shows the
  // grey bar with no animation — mirroring StackCompleteFlash's already-complete no-op.
  const [collapsed, setCollapsed] = useState(stackComplete);

  // Fold shut / open on the seal edge, mirroring StackCompleteFlash's `wasComplete` guard. A
  // genuine seal holds a beat first (Collapse.lead) — the row you ticked keeps its checkmark and
  // the border flash plays out — THEN the whole card folds, so the collapsed affordances (grey
  // summary + chevron) appear *with* the fold rather than racing ahead of a still-open body.
  // Un-sealing (an un-tick, or a member dropped in) re-opens at once.
  const wasComplete = useRef(stackComplete);
  useEffect(() => {
    if (wasComplete.current === stackComplete) return;
    wasComplete.current = stackComplete;
    // Seal → hold a beat (let the ticked row keep its checkmark and the flash play), then fold.
    // Un-seal → re-open promptly. Both run off the timer so the fold and the header's collapsed
    // look land together (and it keeps the state change out of the effect body itself).
    const timer = setTimeout(() => setCollapsed(stackComplete), stackComplete ? Collapse.lead : 0);
    return () => clearTimeout(timer);
  }, [stackComplete]);

  // The body's animated clip. `progress` 1 = open, 0 = folded: height interpolates the measured
  // content height and opacity fades the rows as it shuts. Born at rest so the first frame is
  // already correct (no mount flash).
  const progress = useSharedValue(collapsed ? 0 : 1);
  const contentH = useSharedValue(0);
  // The clip animates a concrete height, which needs the content measured first. Until then the
  // body renders unclipped so onLayout can read its natural height — or, if the card loads already
  // folded, it simply isn't mounted (nothing to clip, no flash), and gets measured on first expand.
  const [measured, setMeasured] = useState(false);
  const showBody = measured || !collapsed;
  const firstRun = useRef(true);
  useEffect(() => {
    const target = collapsed ? 0 : 1;
    if (firstRun.current) {
      firstRun.current = false;
      progress.set(target);
      return;
    }
    // Can't animate a height we haven't measured yet (a card that loaded folded): jump to the
    // target this once — the body mounts at its natural height and measures — then animate from
    // then on. Reduce Motion always jumps. The seal's "hold a beat" lives in the collapse edge (a
    // delayed setCollapsed), so the fold itself is prompt: folding and the header's look land together.
    if (reduceMotion || !measured) {
      progress.set(target);
      return;
    }
    progress.set(withTiming(target, { duration: Collapse.duration, easing: Easing.inOut(Easing.quad) }));
  }, [collapsed, measured, reduceMotion, progress]);

  // Once measured, always drive a concrete height — never omit it. Reanimated keeps the last value
  // a style stops setting, so dropping the height (or setting `undefined`) would strand the body at
  // its folded 0. Before measuring, `bodyStyle` isn't applied (the body is unclipped, auto height).
  const bodyStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return { height: p * contentH.get(), opacity: p };
  });
  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      contentH.set(h);
      if (!measured) setMeasured(true);
    }
  };

  // A light "movement" tick for a hand toggle — the disclosure-adjacent haptic (never a heavier
  // impact; those stay reserved for the completion seal). Auto-collapse stays silent: it rides the
  // stack's existing seal beat.
  const toggleCollapsed = () => {
    haptics.selection();
    setCollapsed((c) => !c);
  };

  return (
    <View>
      <Surface>
        <View style={styles.headerRow}>
          {/* Tapping the title folds / unfolds the stack — the same gesture in either state, so the
              tap never changes meaning. Managing it (rename / delete / add habits) lives on the
              trailing "⋯". An empty card has nothing to fold: its header opens manage instead. */}
          <PressableScale
            onPress={collapsible ? toggleCollapsed : () => onEditStack(stack.id)}
            android_ripple={{ color: theme.backgroundSelected }}
            accessibilityRole="button"
            accessibilityLabel={`${stack.name} stack${stackComplete ? ', completed' : ''}${sunResident ? ', current time of day' : ''}${collapsed ? ', collapsed' : ''}`}
            accessibilityState={collapsible ? { expanded: !collapsed } : undefined}
            accessibilityHint={
              !collapsible
                ? 'Activates to manage the stack. Hold and drag to reorder it.'
                : collapsed
                  ? 'Activates to expand the stack. Hold and drag to reorder it.'
                  : 'Activates to collapse the stack. Hold and drag to reorder it.'
            }
            accessibilityActions={
              onMove
                ? [
                    { name: 'moveUp', label: 'Move up' },
                    { name: 'moveDown', label: 'Move down' },
                  ]
                : undefined
            }
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'moveUp') onMove?.(stack.id, -1);
              if (event.nativeEvent.actionName === 'moveDown') onMove?.(stack.id, 1);
            }}
            style={styles.header}>
            {/* A leading stack glyph in the same 32-wide slot a member row gives its completion ring,
                so the icon sits directly above the circles below and the title lines up with the row
                titles. Accent-tinted while the group is live — the card's one cold-steel note —
                greyed to the done tone once sealed, so the header recedes alongside its muted
                rows. While this stack is the day's
                current chapter, the sun rests in the slot instead (see LeadingGlyph). */}
            <LeadingGlyph sun={sunResident} complete={stackComplete} />
            <ThemedText
              type="rowTitle"
              style={[styles.title, stackComplete && { color: theme.textDisabled }]}
              numberOfLines={1}>
              {stack.name}
            </ThemedText>
          </PressableScale>
          {/* The manage affordance — a quiet "⋯" opening rename / delete / add-habits, reachable in
              any state (its own tap target + a11y button, a sibling so a screen reader gets it apart
              from the header's fold toggle). */}
          <Pressable
            onPress={() => onEditStack(stack.id)}
            hitSlop={8}
            android_ripple={{ color: theme.backgroundSelected, borderless: true }}
            accessibilityRole="button"
            accessibilityLabel={`Manage ${stack.name} stack`}
            accessibilityHint="Rename, delete, or add habits."
            style={({ pressed }) => [styles.manage, pressed && { opacity: Pressed.dim }]}>
            <AppIcon name="ellipsis" size={18} color={theme.textDisabled} />
          </Pressable>
        </View>

        {/* The body folds shut when the stack seals (or is hand-collapsed): an overflow-clipped
            wrapper whose height + opacity ride `progress`. The header stays outside the clip so the
            bar is always tappable. `bodyStyle` applies only once measured (before that the body is
            unclipped so onLayout can read its natural height); a card loaded already-folded skips
            the body entirely and mounts it on first expand. */}
        <Animated.View style={[styles.collapseClip, measured && bodyStyle]}>
          {showBody ? (
            <View onLayout={onContentLayout}>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
              {members.length === 0 ? (
                // A brand-new stack waiting on its first member ("+ → New stack"): the next step
                // lives inside the card itself. Accent-tinted like the header — an invitation, not
                // a habit row. (A loose habit dragged onto the card also joins it, as always.)
                <Pressable
                  onPress={() => onAddHabits?.(stack.id)}
                  android_ripple={{ color: theme.backgroundSelected }}
                  accessibilityRole="button"
                  accessibilityLabel={`Add your first habit to ${stack.name}`}
                  style={({ pressed }) => [styles.addFirst, pressed && { backgroundColor: theme.backgroundSelected }]}>
                  {/* Same 32-wide leading slot as the header glyph and the member circles, so the +
                      sits directly under the stack icon and "Add your first habit" lines up with the
                      stack title (and the habit titles once members arrive). */}
                  <View style={styles.leading}>
                    <AppIcon name="add" size={26} color={theme.accent} />
                  </View>
                  <ThemedText type="rowTitle" themeColor="accent">
                    Add your first habit
                  </ThemedText>
                </Pressable>
              ) : (
                members.map((habit, index) => (
                  <View key={habit.id}>
                    {/* Inset row divider — the same inset-grouped-list rule as the Settings sections. */}
                    {index > 0 ? <RowSeparator /> : null}
                    {/* Swipe a member left to remove it from the stack (or skip/edit/delete); hold and
                        drag it to pull it out of the card — to a spot in the day list, or into another
                        stack. */}
                    <DraggableMemberRow habitId={habit.id} parentStackId={stack.id} memberIndex={index}>
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
                        onRemoveFromStack={onRemoveFromStack}
                        onMove={onMoveHabit}
                      />
                    </DraggableMemberRow>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </Animated.View>
      </Surface>
      {/* Sibling of the Surface (not a child — the Surface clips its content), so the 2px border
          overlays the whole card at its rounded rect and flashes when the stack seals. */}
      <StackCompleteFlash complete={stackComplete} />
    </View>
  );
}

/**
 * The header's leading glyph slot — the stack icon, visited by the sun. While this stack is the
 * day's current chapter the sun glyph rests here in its place (the one warm, non-gold note on
 * the checklist: the same star-cream as the sky's warm anchors, never the completion gold). The
 * two icons cross-fade only on an actual arrival/departure — a card that MOUNTS with the sun
 * already resident shows it at rest, no animation (the `wasResident` edge guard, mirroring
 * StackCompleteFlash) — so day-steps, drags and list churn never replay the transition. The
 * slot keeps its fixed 32-width in every state: card height never changes, so the drag grid's
 * measured frames stay valid.
 */
function LeadingGlyph({ sun, complete }: { sun: boolean; complete: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // Born at rest at the current value; animated only on the resident-flips-edge below.
  const presence = useSharedValue(sun ? 1 : 0);
  const wasResident = useRef(sun);
  useEffect(() => {
    if (wasResident.current === sun) return;
    wasResident.current = sun;
    if (reduceMotion) {
      presence.set(sun ? 1 : 0);
      return;
    }
    presence.set(withTiming(sun ? 1 : 0, { duration: Duration.slow, easing: Easing.inOut(Easing.quad) }));
  }, [sun, reduceMotion, presence]);
  const stackStyle = useAnimatedStyle(() => ({ opacity: 1 - presence.get() }));
  const sunStyle = useAnimatedStyle(() => ({ opacity: presence.get() }));

  return (
    <View style={styles.leading}>
      <Animated.View style={stackStyle}>
        <AppIcon name="stack" size={26} color={complete ? theme.textDisabled : theme.accent} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.leadingOverlay, sunStyle]} pointerEvents="none">
        <AppIcon name="sun" size={24} color={theme.sun} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A bare `Surface` card (radius/border/bg come from Surface) — no margins: the drag grid
  // measures the bare item, so spacing comes from the grid's `gap` + its padding.
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // Spacing.three (not two) so the leading glyph → title gap matches the member row's
    // circle → title gap — the title lands in the same column as the habit titles below.
    gap: Spacing.three,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.two,
    // The card's primary control (fold/unfold) meets the 44pt target while staying
    // shorter than the 56pt member rows, so the header still reads as the compact tier.
    minHeight: 44,
  },
  // Leading glyph slot — the same 32-wide box a HabitRow gives its completion ring, so the
  // stack icon centers on the circles below it.
  leading: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Centers the resting sun over the stack glyph inside the fixed slot (it overlays, never
  // widens — see LeadingGlyph).
  leadingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sized to the member rows (rowTitle, 17pt) so the stack's own name never reads smaller than the
  // habits it holds; the semibold weight + accent leading glyph (not a smaller size, not a tint —
  // accent stays reserved for interactive points) mark it as the header.
  title: { flex: 1, fontWeight: FontWeight.semibold },
  // The trailing "⋯" manage button's tap area; its own right-edge padding stands in for the header's.
  manage: {
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Clips the body as it folds shut; the measured content sits inside in normal flow.
  collapseClip: { overflow: 'hidden' },
  // Full-bleed rule under the stack header (a header separator, distinct from the row dividers).
  divider: { height: StyleSheet.hairlineWidth },
  // The empty card's single "Add your first habit" row — sized like a member row so the card
  // doesn't collapse to a sliver while it waits, and sharing the row's 32-slot + Spacing.three
  // gap so its + and label align with the header glyph/title above and the member rows below.
  addFirst: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56, // exactly a member row's height (HabitRow), so the wait state doesn't sit shorter
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

// Memoized on what the card paints. Like HabitRow, a reorder re-stamps every member's `position`
// into a fresh object and `entries` hands over a fresh `members` array each render — so the default
// identity compare would rebuild the whole card (every member's drag subtree) on the frame a drop
// commits. Compare the rendered stack fields, the members by the fields their rows read, and the
// day-state Sets + callbacks by identity (a tick swaps the Set identity, so completions still land).
// The collapse/fold is local component state, not a prop, so it needs no entry here.
// KEEP IN SYNC: any newly *rendered* stack field or prop must be compared here, or the card will
// silently ignore its changes (`day_part`/`isCurrentChapter` drive the resting sun glyph).
function stackPropsEqual(a: Props, b: Props): boolean {
  if (
    a.stack.id !== b.stack.id ||
    a.stack.name !== b.stack.name ||
    a.stack.day_part !== b.stack.day_part ||
    a.isCurrentChapter !== b.isCurrentChapter ||
    a.completed !== b.completed ||
    a.skipped !== b.skipped ||
    a.counts !== b.counts ||
    a.onToggle !== b.onToggle ||
    a.onAdjust !== b.onAdjust ||
    a.onSkip !== b.onSkip ||
    a.onEdit !== b.onEdit ||
    a.onDelete !== b.onDelete ||
    a.onEditStack !== b.onEditStack ||
    a.onRemoveFromStack !== b.onRemoveFromStack ||
    a.onMove !== b.onMove ||
    a.onMoveHabit !== b.onMoveHabit ||
    a.onAddHabits !== b.onAddHabits ||
    a.members.length !== b.members.length
  ) {
    return false;
  }
  return a.members.every((m, i) => {
    const n = b.members[i]!;
    return (
      m.id === n.id &&
      m.name === n.name &&
      m.target_count === n.target_count &&
      m.target_unit === n.target_unit
    );
  });
}

export const StackCard = memo(StackCardBase, stackPropsEqual);
