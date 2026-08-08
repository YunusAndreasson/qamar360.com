import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';
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
  /** Undoes the add — tapping an already-added row removes it. */
  onRemove: () => void;
  /** Accessible name for the row body (item name + schedule/summary). */
  rowAccessibilityLabel: string;
  expandHint: string;
  collapseHint?: string;
  /** The revealed detail — evidence text, a habit sequence, etc. Read-only: adding is the row's job. */
  children: ReactNode;
};

/**
 * A Discover library row: tap it to add — or to remove, once added — the same tap-to-toggle idiom
 * as a checklist item, so an already-added item is never a dead end. A small trailing chevron
 * reveals the "why"/"what's inside" without touching the add state, so the row body stays a
 * single add control. Backs {@link SunnahPresetRow}.
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

  // The beat fires BEFORE the handler, so a handler that declines has already been felt as a
  // success. That is a promise the row can't take back — so a caller that may decline owes the user
  // a reason (a toast, a message), never a silent return. Discover's unscoped `addPreset` was
  // exactly such a return for a while, and the tap buzzed at a screen where nothing changed.
  const toggleAdd = () => {
    if (added) {
      haptics.removed();
      onRemove();
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
        <Touchable
          onPress={toggleAdd}
          androidRipple={{ color: theme.backgroundSelected }}
          activeOpacity={Pressed.dim}
          accessibilityRole="button"
          accessibilityState={{ selected: added }}
          accessibilityLabel={rowAccessibilityLabel}
          accessibilityHint={added ? 'Removes it from your habits' : 'Adds it to your habits'}
          style={styles.add}>
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
        </Touchable>
        <Touchable
          onPress={toggleExpand}
          hitSlop={8}
          androidRipple={{ color: theme.backgroundSelected, borderless: true }}
          activeOpacity={Pressed.dim}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title} details`}
          accessibilityHint={expanded ? collapseHint : expandHint}
          style={styles.expandButton}>
          <AppIcon name={expanded ? 'expandLess' : 'expandMore'} size={16} color={theme.textSecondary} />
        </Touchable>
      </View>

      {expanded ? (
        // A shared-value mount fade (FadeInView) — NOT reanimated entering/exiting. On the New
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
  // The tap-to-add area owns the left padding so its ripple/press dim reaches the edge. Tight
  // vertical padding (the two-line title+subtitle already sets a comfortable height): a library of
  // these should scan compact, closer to a native list row than the app's roomier settings rows.
  add: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44, // the iOS minimum tap target; the content sits a little above it
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.one,
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
  detail: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    paddingTop: Spacing.one,
    gap: Spacing.two,
  },
});
