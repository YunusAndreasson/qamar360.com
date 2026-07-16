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
import { Collapse } from '@/constants/motion';
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
 * day's remaining work rises. The bar taps open again; a trailing chevron folds it (and
 * any stack, done or not, can be tucked away by hand).
 */
function StackCardBase({ stack, members, completed, skipped, counts, onToggle, onAdjust, onSkip, onEdit, onDelete, onEditStack, onRemoveFromStack, onMove, onMoveHabit, onAddHabits }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // The whole group sealed — every act the stack has due today is done. Drives the one-shot border
  // flash, the greyed "done" header tone, and the auto-collapse; the synced completion haptic is
  // fired from the toggle seam in use-habits.
  const stackComplete = isStackComplete(members, completed, skipped);
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
  const expand = () => {
    haptics.selection();
    setCollapsed(false);
  };
  const toggleCollapsed = () => {
    haptics.selection();
    setCollapsed((c) => !c);
  };

  const doneCount = members.filter((m) => completed.has(m.id)).length;

  return (
    <View>
      <Surface>
        <View style={styles.headerRow}>
          <PressableScale
            onPress={collapsed ? expand : () => onEditStack(stack.id)}
            android_ripple={{ color: theme.backgroundSelected }}
            accessibilityRole="button"
            accessibilityLabel={`${stack.name} stack${stackComplete ? ', completed' : ''}${collapsed ? ', collapsed' : ''}`}
            accessibilityState={{ expanded: !collapsed }}
            accessibilityHint={
              collapsed
                ? 'Activates to expand the stack.'
                : 'Activates to manage the stack — rename or delete it. Hold and drag to reorder the whole stack.'
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
            style={[styles.header, !collapsible && styles.headerPadRight]}>
            {/* A leading stack glyph in the same 32-wide slot a member row gives its completion ring,
                so the icon sits directly above the circles below and the title lines up with the row
                titles. Accent-tinted while the group is live; greyed to the done tone once sealed, so
                the header recedes alongside its struck-through rows. */}
            <View style={styles.leading}>
              <AppIcon name="stack" size={26} color={stackComplete ? theme.textDisabled : theme.accent} />
            </View>
            <ThemedText
              type="rowTitle"
              themeColor="accent"
              style={[styles.title, stackComplete && { color: theme.textDisabled }]}
              numberOfLines={1}>
              {stack.name}
            </ThemedText>
            {/* Folded → a quiet summary so a collapsed stack still reads at a glance: a check + the
                done count when sealed, else a done/total progress numeral. */}
            {collapsed ? (
              <View style={styles.summary}>
                {stackComplete ? <AppIcon name="check" size={16} color={theme.complete} /> : null}
                <ThemedText type="small" themeColor="textSecondary">
                  {stackComplete ? `${doneCount}` : `${doneCount}/${members.length}`}
                </ThemedText>
              </View>
            ) : null}
          </PressableScale>
          {/* A trailing disclosure chevron — its own tap target and a11y button (a sibling, not
              nested, so a screen reader reaches it independently of the header). It replaces the old
              "⋯": tapping the header body still opens the manage sheet (or expands, when folded). */}
          {collapsible ? (
            <Pressable
              onPress={toggleCollapsed}
              hitSlop={8}
              android_ripple={{ color: theme.backgroundSelected, borderless: true }}
              accessibilityRole="button"
              accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${stack.name} stack`}
              accessibilityState={{ expanded: !collapsed }}
              accessibilityHint={collapsed ? 'Expands the stack' : 'Collapses the stack'}
              style={({ pressed }) => [styles.chevron, pressed && { opacity: Pressed.dim }]}>
              <AppIcon name={collapsed ? 'expandMore' : 'expandLess'} size={22} color={theme.textDisabled} />
            </Pressable>
          ) : null}
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
            <View>
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
  },
  // When there's no trailing chevron (the empty "Add your first habit" card), the header owns the
  // right padding the chevron would otherwise provide.
  headerPadRight: {
    paddingRight: Spacing.three,
  },
  // Leading glyph slot — the same 32-wide box a HabitRow gives its completion ring, so the
  // stack icon centers on the circles below it.
  leading: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sized to the member rows (rowTitle, 17pt) so the stack's own name never reads smaller than the
  // habits it holds; the accent tint + semibold weight (not a smaller size) mark it as the header.
  title: { flex: 1, fontWeight: FontWeight.semibold },
  // A folded stack's at-a-glance state, sitting between the title and the chevron.
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // The disclosure chevron's tap area; its own right-edge padding stands in for the header's.
  chevron: {
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
    minHeight: 52,
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
function stackPropsEqual(a: Props, b: Props): boolean {
  if (
    a.stack.id !== b.stack.id ||
    a.stack.name !== b.stack.name ||
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
