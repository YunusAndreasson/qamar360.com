import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { CompletionRing } from '@/components/completion-ring';
import { PressableScale } from '@/components/pressable-scale';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Scale, Spring } from '@/constants/motion';
import { Radius, Spacing } from '@/constants/theme';
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
  /** A lone top-level habit (not a stack member): give it its own tappable card surface.
   *  Standalone rows are sortable-list items, so they also long-press to reorder. */
  standalone?: boolean;
};

// Staggered reveal — each trailing action fades/slides in left-to-right as the panel
// opens, keyed by its slot so Skip leads and Delete lands last.
const ACTION_ENTRY_DELAY = { skip: 0.04, edit: 0.12, delete: 0.2 } as const;

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

function HabitRowBase({ habit, done, skipped, count = 0, onToggle, onAdjust, onSkip, onEdit, onDelete, standalone }: Props) {
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

  // Spring "pop" on the check icon when a habit is completed — a tactile-feeling
  // confirmation. We skip the very first run so rows that load already-done don't
  // animate on mount; only a genuine toggle pops. Under Reduce Motion the icon's
  // colour/shape change already conveys completion, so we drop the scale animation
  // entirely rather than just shrinking it (HIG: substitute, don't soften).
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reduceMotion) {
      scale.set(1);
      return;
    }
    scale.set(
      done
        ? withSequence(withSpring(Scale.pop, Spring.confirm), withSpring(1, Spring.settle))
        : withSpring(1, Spring.settle),
    );
  }, [done, scale, reduceMotion]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

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
        // a binary habit toggles done on tap. A standalone row's long-press pickup belongs to
        // the sortable list (Sortable.Grid), not to this Pressable.
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
              ? 'Use the stepper to log progress. Long press to reorder. Swipe left to skip, edit, or delete.'
              : 'Use the stepper to log progress. Swipe left to skip, edit, or delete.'
            : standalone
              ? 'Activates to toggle done. Long press to reorder. Swipe left to skip, edit, or delete.'
              : 'Activates to toggle done. Swipe left to skip, edit, or delete.'
        }
        // A press lights the whole band rather than just dimming it, so the entire row reads as
        // one button — leading circle to trailing edge is the tap target. The press flash is for
        // tap-to-toggle only (so a count row, whose body doesn't toggle, doesn't flash); the
        // picked-up-to-reorder lift is drawn by the sortable list (`activeItemScale`/shadow).
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
              style={[styles.stepButton, { borderColor: theme.controlTrack }]}>
              <AppIcon name="remove" size={18} color={count <= 0 ? theme.textDisabled : theme.text} />
            </PressableScale>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.stepCount}>
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
              style={[styles.stepButton, { borderColor: theme.controlTrack }]}>
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
  // No margins here: the sortable list measures the bare item, so spacing between
  // cards is the list's `rowGap`, and the side gutters are the list wrapper's padding.
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

// Memoized: only the toggled row's `done` changes, so the rest skip re-render.
export const HabitRow = memo(HabitRowBase);
