import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo, useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
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

import { PressableScale } from '@/components/pressable-scale';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Scale, Spring } from '@/constants/motion';
import { Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Props = {
  habit: Habit;
  done: boolean;
  /** True when this habit is legitimately skipped (excused) for the viewed day. */
  skipped: boolean;
  onToggle: (id: string) => void;
  /** Toggle the habit's skipped (excused) state for the viewed day. */
  onSkip: (id: string) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (id: string) => void;
  /** Starts a drag-to-reorder gesture (from DraggableFlatList). */
  drag?: () => void;
  /** True while this row is being dragged. */
  isActive?: boolean;
  /** A lone top-level habit (not a stack member): give it its own tappable card surface. */
  standalone?: boolean;
};

// Staggered reveal — each trailing action fades/slides in left-to-right as the panel
// opens, keyed by its slot so Skip leads and Delete lands last.
const ACTION_ENTRY_DELAY = { skip: 0.04, edit: 0.12, delete: 0.2 } as const;

type SwipeActionProps = {
  progress: SharedValue<number>;
  kind: keyof typeof ACTION_ENTRY_DELAY;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
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
    const opacity = interpolate(progress.value, [0, entryDelay, 1], [0, 0.4, 1], Extrapolation.CLAMP);
    const shift = interpolate(progress.value, [0, 1], [28, 0], Extrapolation.CLAMP);
    const settle = interpolate(progress.value, [0, 1], [0.98, 1], Extrapolation.CLAMP);

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
        <MaterialIcons name={icon} size={20} color={foregroundColor} />
        <ThemedText type="small" style={{ color: foregroundColor }}>
          {label}
        </ThemedText>
      </PressableScale>
    </Animated.View>
  );
}

function HabitRowBase({ habit, done, skipped, onToggle, onSkip, onEdit, onDelete, drag, isActive, standalone }: Props) {
  const theme = useTheme();

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
      scale.value = 1;
      return;
    }
    scale.value = done
      ? withSequence(withSpring(Scale.pop, Spring.confirm), withSpring(1, Spring.settle))
      : withSpring(1, Spring.settle);
  }, [done, scale, reduceMotion]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Long-press hands off to DraggableFlatList; a "pick up" bump marks the grab.
  const onLongPress = drag
    ? () => {
        haptics.pickup();
        drag();
      }
    : undefined;

  // Skip, Edit, and Delete live in a trailing swipe — the platform-standard home for a
  // list item's secondary actions (Reminders, Mail). The row stays a clean check + label;
  // the gesture stays out of the way of tap-to-toggle and long-press-to-reorder. Skip is
  // an excused, completeness-neutral miss (travel, menstruation); it leads the panel.
  const confirmDelete = () => {
    Alert.alert('Delete habit', `Delete “${habit.name}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(habit.id) },
    ]);
  };

  const renderRightActions = (
    progress: SharedValue<number>,
    _translation: SharedValue<number>,
    swipeable: SwipeableMethods,
  ) => (
    <View style={styles.actions}>
      <SwipeAction
        progress={progress}
        kind="skip"
        label={skipped ? 'Unskip' : 'Skip'}
        icon={skipped ? 'undo' : 'do-not-disturb-on'}
        backgroundColor={theme.backgroundElement}
        foregroundColor={theme.textSecondary}
        rippleColor={theme.backgroundSelected}
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
      renderRightActions={renderRightActions}
      friction={1.35}
      rightThreshold={72}
      overshootRight={false}
      // While a reorder drag is in progress, the row is following the finger —
      // don't let a stray horizontal pan also open the swipe panel.
      enabled={!isActive}>
      <Pressable
        onPress={() => onToggle(habit.id)}
        onLongPress={onLongPress}
        disabled={isActive}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={skipped ? `${habit.name}, skipped` : habit.name}
        accessibilityHint={
          drag
            ? 'Activates to toggle done. Long press to reorder. Swipe left to skip, edit, or delete.'
            : 'Activates to toggle done. Swipe left to skip, edit, or delete.'
        }
        // A press lights the whole band rather than just dimming it, so the entire
        // row reads as one button — leading circle to trailing edge is the tap target.
        style={({ pressed }) => [styles.row, (pressed || isActive) && { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.iconShell, { backgroundColor: theme.backgroundElement }]}>
          <Animated.View style={iconStyle}>
            {/* Done = filled check; skipped = a "no-entry" circle (excused, not missed);
                otherwise the empty ring. Skipped shares the muted tone but a distinct glyph. */}
            <MaterialIcons
              name={done ? 'check-circle' : skipped ? 'do-not-disturb-on' : 'radio-button-unchecked'}
              size={28}
              color={done ? theme.success : theme.textSecondary}
            />
          </Animated.View>
        </View>
        <ThemedText
          type="default"
          // Done is struck through; skipped is merely muted (no strikethrough — it's
          // excused, not finished, and reads differently from a completed act).
          style={[
            styles.label,
            done && { color: theme.textDisabled, textDecorationLine: 'line-through' },
            skipped && { color: theme.textSecondary },
          ]}>
          {habit.name}
        </ThemedText>
      </Pressable>
    </ReanimatedSwipeable>
  );

  // A lone habit sits on its own card surface so the whole row plainly reads as a
  // tappable unit (matching the stack cards and the Settings rows). Stack members
  // stay transparent — they already live on the stack card, under its connector rail.
  if (!standalone) return row;
  return <Surface style={styles.surface}>{row}</Surface>;
}

const styles = StyleSheet.create({
  // Mirrors the stack card so a lone habit and a stack read as siblings in the list
  // (both are `Surface` cards; only the margins live here).
  surface: {
    marginHorizontal: Spacing.three,
    marginVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56, // comfortably above the 44pt minimum tap target
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  iconShell: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  label: { flex: 1 },
  actions: { flexDirection: 'row', alignSelf: 'stretch' },
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
