import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { FadeInView } from '@/components/fade-in-view';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import { useConfirmPop } from '@/hooks/use-confirm-pop';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle: string;
  added: boolean;
  onAdd: () => void;
  /** When added, makes the row tappable to undo the add. Omitting it leaves "added" inert. */
  onRemove?: () => void;
  /** Accessible name for the row body (item name + schedule/summary). */
  rowAccessibilityLabel: string;
  expandHint: string;
  collapseHint?: string;
  /** The revealed detail — evidence text, a habit sequence, etc. Read-only: adding is the row's job. */
  children: ReactNode;
};

/**
 * A Discover library row: tap it to add — or to remove, once added — the same tap-to-toggle idiom
 * as a `HabitRow` checklist item, so an already-added item is never a dead end. A small trailing
 * chevron reveals the "why"/"what's inside" without touching the add state, so there's exactly one
 * add control per row (never a second one behind the chevron). Backs both {@link SunnahPresetRow}
 * and {@link SunnahRoutineRow}.
 */
export function ExpandableAddRow({
  title,
  subtitle,
  added,
  onAdd,
  onRemove,
  rowAccessibilityLabel,
  expandHint,
  collapseHint = 'Collapse details',
  children,
}: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  // Expanding to read the detail is plain disclosure with clear visual feedback — no haptic.
  const toggleExpand = () => setExpanded((v) => !v);

  // Added + removable → tapping the row undoes the add; added without a remover → inert.
  const inert = added && !onRemove;
  const toggleAdd = () => {
    if (inert) return;
    if (added) {
      haptics.removed();
      onRemove?.();
    } else {
      haptics.added();
      onAdd();
    }
  };

  // Not-added is the call to action: a tonal wash with an accent + (a solid accent disc made
  // every unadded row the heaviest thing on the screen — worst in light mode, where the deep
  // steel read as a column of dark dots). Added recedes: a bare muted check, no disc — matching
  // the row's inert/undo state, so what you already have whispers and what you could add speaks.
  const badgeColor = added ? 'transparent' : theme.accentSubtle;
  const iconColor = added ? theme.textSecondary : theme.accent;

  // The badge pops on a genuine add — the same confirm spring as ticking a habit on Today
  // (and it rides the same Rigid "commit" haptic via `haptics.added`), so saying yes feels
  // identical on both screens. Removing springs quietly back; mount never animates.
  const badgePop = useConfirmPop(added);

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={toggleAdd}
          disabled={inert}
          android_ripple={{ color: theme.backgroundSelected }}
          accessibilityRole="button"
          accessibilityState={{ disabled: inert, selected: added }}
          accessibilityLabel={rowAccessibilityLabel}
          accessibilityHint={
            added ? (onRemove ? 'Removes it from your habits' : 'Already added to your habits') : 'Adds it to your habits'
          }
          style={({ pressed }) => [styles.add, pressed && !inert && styles.pressed]}>
          <Animated.View style={[styles.badge, { backgroundColor: badgeColor }, badgePop]}>
            <AppIcon name={added ? 'check' : 'add'} size={20} color={iconColor} />
          </Animated.View>
          <View style={styles.labels}>
            {/* `rowTitle` (17pt) — the same primary-label size every other list row uses. */}
            <ThemedText type="rowTitle" numberOfLines={2} style={styles.title}>
              {title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          </View>
        </Pressable>
        <Pressable
          onPress={toggleExpand}
          hitSlop={8}
          android_ripple={{ color: theme.backgroundSelected, borderless: true }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title} details`}
          accessibilityHint={expanded ? collapseHint : expandHint}
          style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}>
          <AppIcon name={expanded ? 'expandLess' : 'expandMore'} size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      {expanded ? (
        // A CSS-animation mount fade (FadeInView) — NOT reanimated entering/exiting. On the New
        // Architecture those layout animations depend on a nativeID that Fabric's view-flattening
        // clobbers, which left the body mounted at opacity 0 (empty on open) and only flashed it
        // on unmount (flicker on close). Collapse stays an instant removal: exit animations need
        // that same broken layout-animation machinery.
        <FadeInView style={styles.detail}>{children}</FadeInView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The tap-to-add area owns the left padding so its ripple/press dim reaches the edge.
  add: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  badge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  labels: { flex: 1, gap: Spacing.half },
  title: { flexShrink: 1 },
  // Its own small hit area, clearly set apart from the (much larger) add target.
  expandButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    marginRight: Spacing.one,
  },
  pressed: { opacity: Pressed.dim },
  detail: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    paddingTop: Spacing.one,
    gap: Spacing.two,
  },
});
