import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { CompletionRing } from '@/components/completion-ring';
import { PressableScale } from '@/components/pressable-scale';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useConfirmPop } from '@/hooks/use-confirm-pop';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import { clamp01 } from '@/lib/progress';

type Props = {
  habit: Habit;
  done: boolean;
  /** True when this habit is legitimately skipped (excused) for the viewed day. */
  skipped: boolean;
  /** For count-goal habits: the count logged for the viewed day (0 when nothing logged). */
  count?: number;
  onToggle: (id: string) => void;
  /** Step a count-goal habit's logged count for the viewed day by `delta` (±1). */
  onAdjust?: (id: string, delta: number) => void;
  /** Toggle the habit's skipped (excused) state for the viewed day. */
  onSkip: (id: string) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (id: string) => void;
  /** Open the "add to stack" picker for this habit. Only wired for standalone (ungrouped)
   *  rows — a stack member already belongs to one, so the action is omitted there.
   *  (The drag offers the same move: drop the row onto a stack card.) */
  onAddToStack?: (habit: Habit) => void;
  /** Detach this habit from its stack (back to standalone). The mirror of `onAddToStack`:
   *  wired only for stack members — the explicit swipe counterpart to dragging the member row
   *  out of its card. */
  onRemoveFromStack?: (habit: Habit) => void;
  /** Screen-reader reorder (exposed as Move up / Move down accessibility actions — the
   *  non-visual equivalent of the drag): a standalone row moves in the day list, a member row
   *  moves within its stack. */
  onMove?: (habit: Habit, delta: -1 | 1) => void;
  /** Screen-reader "stack with the next habit" — the gesture-free equivalent of dropping this
   *  lone habit onto the one below it. Wired (standalone rows only) only when a lone-habit
   *  neighbour exists, so the action never no-ops. */
  onGroupWithNext?: (habit: Habit) => void;
  /** A lone top-level habit (not a stack member): give it its own tappable card surface.
   *  Standalone rows long-press-drag to reorder or to drop onto a stack card. */
  standalone?: boolean;
};

// Staggered reveal — each trailing action fades/slides in left-to-right as the panel
// opens, keyed by its slot so Skip leads and Delete lands last. `stack` slots between
// Edit and Delete (standalone rows only), so Skip/Edit/Delete keep their original timing.
const ACTION_ENTRY_DELAY = { skip: 0.04, edit: 0.12, stack: 0.16, delete: 0.2 } as const;

// The one open swipe panel across every row (module-scoped: rows live in different cards and
// lists but share one screen). Opening a second panel closes the first — the Reminders/Mail
// idiom — so stale panels don't accumulate as you swipe down the checklist.
let openSwipeable: SwipeableMethods | null = null;

type SwipeActionProps = {
  progress: SharedValue<number>;
  kind: keyof typeof ACTION_ENTRY_DELAY;
  label: string;
  icon: IconName;
  backgroundColor: string;
  foregroundColor: string;
  rippleColor: string;
  onPress: () => void;
  accessibilityLabel: string;
};

function SwipeAction({
  progress,
  kind,
  label,
  icon,
  backgroundColor,
  foregroundColor,
  rippleColor,
  onPress,
  accessibilityLabel,
}: SwipeActionProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const entryDelay = ACTION_ENTRY_DELAY[kind];
    const p = progress.get();
    const opacity = interpolate(p, [0, entryDelay, 1], [0, 0.4, 1], Extrapolation.CLAMP);
    const shift = interpolate(p, [0, 1], [28, 0], Extrapolation.CLAMP);
    const settle = interpolate(p, [0, 1], [0.98, 1], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateX: shift }, { scale: settle }],
    };
  }, [kind]);

  return (
    <Animated.View style={[styles.actionClip, animatedStyle]}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        android_ripple={{ color: rippleColor }}
        style={[styles.action, { backgroundColor }]}>
        <AppIcon name={icon} size={20} color={foregroundColor} />
        <ThemedText type="small" style={{ color: foregroundColor }}>
          {label}
        </ThemedText>
      </PressableScale>
    </Animated.View>
  );
}

function HabitRowBase({ habit, done, skipped, count = 0, onToggle, onAdjust, onSkip, onEdit, onDelete, onAddToStack, onRemoveFromStack, onMove, onGroupWithNext, standalone }: Props) {
  const theme = useTheme();

  // The swipeable's handle (for the single-open rule) and whether its panel is showing — the
  // hidden actions are dropped from the accessibility tree while closed, so screen readers
  // don't traverse three invisible buttons per row.
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // A row deleted while its panel is open must not leave the module slot pointing at it.
  useEffect(
    () => () => {
      if (openSwipeable === swipeableRef.current) openSwipeable = null;
    },
    [],
  );

  // A count goal (numeric daily target) is logged with a −/+ stepper rather than a single
  // tap; `target == null` is an ordinary binary habit (tap the row to toggle done).
  const target = habit.target_count;
  const isCount = target != null;

  // The completion fraction that fills the leading moon ring (the same unit the Progress grid
  // uses): a count goal waxes by `count ÷ target`; a binary habit is a full moon when done.
  const fraction = isCount && target ? clamp01(count / target) : done ? 1 : 0;

  // When a count goal is met the whole stepper recedes to echo the struck-through label: its
  // button rings drop from the live `controlTrack` to the quiet card hairline (controlTrack is
  // actually *brighter* than the disabled glyph tone on the dark card, so leaving it would make
  // the ring outshine its own muted contents), and its readout/− glyph go to `textDisabled`. The
  // − stays live for a correction — muted, not disabled. The + is already `textDisabled` here.
  const stepBorderColor = done ? theme.border : theme.controlTrack;

  // The confirmation "pop" on the leading mark when a habit is completed — the shared
  // spring the Discover add-badge uses too (see use-confirm-pop for the mount-skip and
  // Reduce Motion rules). It scales the whole indicator while the ring inside runs the
  // `Tick` choreography (arc sweep + check draw) — one moment, two layers of the same clock.
  const iconStyle = useConfirmPop(done);

  // Skip, Edit, and Delete live in a trailing swipe — the platform-standard home for a
  // list item's secondary actions (Reminders, Mail). The row stays a clean check + label;
  // the gesture stays out of the way of tap-to-toggle and long-press-to-reorder. Skip is
  // an excused, completeness-neutral miss (travel, menstruation); it leads the panel.
  const confirmDelete = () =>
    confirmDestructive({
      title: 'Delete habit',
      message: `Delete “${habit.name}”? This can’t be undone.`,
      onConfirm: () => onDelete(habit.id),
    });

  const renderRightActions = (
    progress: SharedValue<number>,
    _translation: SharedValue<number>,
    swipeable: SwipeableMethods,
  ) => (
    <View
      style={styles.actions}
      accessibilityElementsHidden={!panelOpen}
      importantForAccessibility={panelOpen ? 'auto' : 'no-hide-descendants'}>
      <SwipeAction
        progress={progress}
        kind="skip"
        label={skipped ? 'Unskip' : 'Skip'}
        icon={skipped ? 'undo' : 'skip'}
        // The same tonal block as Edit (a bare card-coloured block read as a floating icon);
        // the hairline gap between blocks keeps them reading as three separate actions.
        backgroundColor={theme.backgroundSelected}
        foregroundColor={theme.textSecondary}
        rippleColor={theme.backgroundElement}
        onPress={() => {
          swipeable.close();
          onSkip(habit.id);
        }}
        accessibilityLabel={skipped ? `Unskip ${habit.name}` : `Skip ${habit.name}`}
      />
      <SwipeAction
        progress={progress}
        kind="edit"
        label="Edit"
        icon="edit"
        backgroundColor={theme.backgroundSelected}
        foregroundColor={theme.text}
        rippleColor={theme.backgroundElement}
        onPress={() => {
          swipeable.close();
          onEdit(habit);
        }}
        accessibilityLabel={`Edit ${habit.name}`}
      />
      {/* The stack "organise" swipe action, accent-tinted against the neutral Skip/Edit blocks:
          a lone habit is *added* to a stack (picker) — the discoverable counterpart of dropping it
          onto a card. Removing a member is drag-only now (drag the row out of its card); screen
          readers keep the row's "Remove from stack" action, so no Remove button clutters the swipe. */}
      {standalone && onAddToStack ? (
        <SwipeAction
          progress={progress}
          kind="stack"
          label="Stack"
          icon="addLink"
          backgroundColor={theme.accentSubtle}
          foregroundColor={theme.accent}
          rippleColor={theme.backgroundElement}
          onPress={() => {
            swipeable.close();
            onAddToStack(habit);
          }}
          accessibilityLabel={`Add ${habit.name} to a stack`}
        />
      ) : null}
      <SwipeAction
        progress={progress}
        kind="delete"
        label="Delete"
        icon="delete"
        backgroundColor={theme.danger}
        foregroundColor={theme.dangerText}
        rippleColor={theme.rippleOnFill}
        onPress={() => {
          swipeable.close();
          confirmDelete();
        }}
        accessibilityLabel={`Delete ${habit.name}`}
      />
    </View>
  );

  const row = (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      friction={1.35}
      rightThreshold={72}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        if (openSwipeable && openSwipeable !== swipeableRef.current) openSwipeable.close();
        openSwipeable = swipeableRef.current;
        setPanelOpen(true);
      }}
      onSwipeableClose={() => {
        if (openSwipeable === swipeableRef.current) openSwipeable = null;
        setPanelOpen(false);
      }}>
      <Pressable
        // A count goal is logged with its stepper (below), so the row body doesn't toggle;
        // a binary habit toggles done on tap. A row's long-press pickup belongs to the drag
        // layer's wrapper (DraggableEntry / DraggableMemberRow), not to this Pressable.
        onPress={isCount ? undefined : () => onToggle(habit.id)}
        android_ripple={isCount ? undefined : { color: theme.backgroundSelected }}
        accessibilityRole={isCount ? 'adjustable' : 'checkbox'}
        accessibilityState={{ checked: done }}
        accessibilityValue={isCount ? { min: 0, max: target ?? 0, now: count } : undefined}
        accessibilityLabel={
          isCount
            ? `${habit.name}, ${count} of ${target}${habit.target_unit ? ` ${habit.target_unit}` : ''}`
            : skipped
              ? `${habit.name}, skipped`
              : habit.name
        }
        accessibilityHint={
          isCount
            ? standalone
              ? 'Use the stepper to log progress. Hold and drag to reorder or drop onto a stack. Swipe left to add to a stack, skip, edit, or delete.'
              : 'Use the stepper to log progress. Hold and drag to move it out of its stack. Swipe left to remove from its stack, skip, edit, or delete.'
            : standalone
              ? 'Activates to toggle done. Hold and drag to reorder, drop onto a stack, or drop onto another habit to stack the two. Swipe left to add to a stack, skip, edit, or delete.'
              : 'Activates to toggle done. Hold and drag to move it out of its stack. Swipe left to remove from its stack, skip, edit, or delete.'
        }
        // Everything the drag can do, as screen-reader actions (full parity — a drag gesture
        // is invisible to TalkBack/VoiceOver): reorder via Move up/down, and the stack
        // membership change appropriate to the row.
        accessibilityActions={[
          ...(onMove
            ? [
                { name: 'moveUp', label: 'Move up' },
                { name: 'moveDown', label: 'Move down' },
              ]
            : []),
          ...(standalone && onAddToStack ? [{ name: 'addToStack', label: 'Add to stack' }] : []),
          ...(standalone && onGroupWithNext ? [{ name: 'groupWithNext', label: 'Stack with next habit' }] : []),
          ...(!standalone && onRemoveFromStack
            ? [{ name: 'removeFromStack', label: 'Remove from stack' }]
            : []),
        ]}
        onAccessibilityAction={(event) => {
          switch (event.nativeEvent.actionName) {
            case 'moveUp':
              onMove?.(habit, -1);
              break;
            case 'moveDown':
              onMove?.(habit, 1);
              break;
            case 'addToStack':
              onAddToStack?.(habit);
              break;
            case 'groupWithNext':
              onGroupWithNext?.(habit);
              break;
            case 'removeFromStack':
              onRemoveFromStack?.(habit);
              break;
          }
        }}
        // A press lights the whole band rather than just dimming it, so the entire row reads as
        // one button — leading circle to trailing edge is the tap target. The press flash is for
        // tap-to-toggle only (so a count row, whose body doesn't toggle, doesn't flash); the
        // picked-up lift is drawn by the drag layer (pre-lift swell, then the floating ghost).
        style={({ pressed }) => [styles.row, pressed && !isCount && { backgroundColor: theme.backgroundSelected }]}>
        <Animated.View style={[styles.indicator, iconStyle]}>
          {/* The leading mark is a ring that resolves to a check — a count goal fills it partway in
              cool steel, a binary habit closes it in one tap and lights up warm at done. (No moon
              here: a full moon means the calendar on Progress, not a finished task.) Skipped keeps a
              distinct "no-entry" glyph — it's excused, a state apart from the completion continuum,
              not a half-done point on it. */}
          {skipped ? (
            <AppIcon name="skip" size={28} color={theme.textSecondary} />
          ) : (
            <CompletionRing fraction={fraction} size={28} strokeWidth={3} />
          )}
        </Animated.View>
        <ThemedText
          type="rowTitle"
          numberOfLines={2}
          // Done is struck through; skipped is merely muted (no strikethrough — it's
          // excused, not finished, and reads differently from a completed act).
          style={[
            styles.label,
            done && { color: theme.textDisabled, textDecorationLine: 'line-through' },
            skipped && { color: theme.textSecondary },
          ]}>
          {habit.name}
        </ThemedText>
        {isCount ? (
          // The count goal's logger: −  n / target unit  +. Each button is its own pressable
          // so it captures the tap (the row body stays a long-press-to-reorder target).
          <View style={styles.stepper}>
            <PressableScale
              onPress={() => onAdjust?.(habit.id, -1)}
              disabled={count <= 0}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Remove one from ${habit.name}`}
              accessibilityState={{ disabled: count <= 0 }}
              style={[styles.stepButton, { borderColor: stepBorderColor }]}>
              <AppIcon name="remove" size={18} color={count <= 0 || done ? theme.textDisabled : theme.accent} />
            </PressableScale>
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              style={[styles.stepCount, done && { color: theme.textDisabled }]}>
              {count}/{target}
              {habit.target_unit ? ` ${habit.target_unit}` : ''}
            </ThemedText>
            <PressableScale
              onPress={() => onAdjust?.(habit.id, 1)}
              disabled={count >= (target ?? 0)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Add one to ${habit.name}`}
              accessibilityState={{ disabled: count >= (target ?? 0) }}
              style={[styles.stepButton, { borderColor: stepBorderColor }]}>
              <AppIcon name="add" size={18} color={count >= (target ?? 0) ? theme.textDisabled : theme.accent} />
            </PressableScale>
          </View>
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );

  // A lone habit sits on its own card surface so the whole row plainly reads as a
  // tappable unit (matching the stack cards and the Settings rows). Stack members
  // stay transparent — they already live on the stack card, under its connector rail.
  // No margins here: the drag grid measures the bare item, so spacing between cards
  // is the grid's `gap`, and the side gutters are the grid's padding.
  if (!standalone) return row;
  return <Surface>{row}</Surface>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56, // comfortably above the 44pt minimum tap target
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  indicator: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepCount: {
    minWidth: 40,
    maxWidth: 96,
    textAlign: 'center',
    // Tabular figures so the count doesn't jiggle the layout as digits change (9 → 10).
    fontVariant: ['tabular-nums'],
  },
  // The hairline gap lets the card show through between the tonal blocks, separating them.
  actions: { flexDirection: 'row', alignSelf: 'stretch', gap: StyleSheet.hairlineWidth },
  actionClip: {
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  action: {
    width: 76,
    minHeight: 56,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
});

// Memoized on the fields this row actually paints. A reorder / move / merge re-stamps every
// habit's `position` (and sometimes `stack_id`) into a fresh object — fields the row never
// renders — so the default identity compare would re-render (and re-measure the two-line title
// of) EVERY row on the frame a drop commits, jerking the text as the ghost's settle spring lands.
// The React Compiler can't know `position`/`stack_id` are render-irrelevant here, so we spell out
// the comparison: the four habit fields the row reads, the day-state props, and every callback by
// identity (all stable — the screen's handlers close over refs, not `habits`). Keep this in sync
// if the row starts rendering another `habit` field.
function propsEqual(a: Props, b: Props): boolean {
  return (
    a.habit.id === b.habit.id &&
    a.habit.name === b.habit.name &&
    a.habit.target_count === b.habit.target_count &&
    a.habit.target_unit === b.habit.target_unit &&
    a.done === b.done &&
    a.skipped === b.skipped &&
    a.count === b.count &&
    a.standalone === b.standalone &&
    a.onToggle === b.onToggle &&
    a.onAdjust === b.onAdjust &&
    a.onSkip === b.onSkip &&
    a.onEdit === b.onEdit &&
    a.onDelete === b.onDelete &&
    a.onAddToStack === b.onAddToStack &&
    a.onRemoveFromStack === b.onRemoveFromStack &&
    a.onMove === b.onMove &&
    a.onGroupWithNext === b.onGroupWithNext
  );
}

export const HabitRow = memo(HabitRowBase, propsEqual);
