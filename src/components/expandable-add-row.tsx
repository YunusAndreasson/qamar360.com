import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AddPill, ADDED_LABEL } from '@/components/add-pill';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle: string;
  added: boolean;
  onAdd: () => void;
  /** Habit/routine name, for the accessible labels of both add controls. */
  itemLabel: string;
  /** Visible label of the full-width add button in the expanded body. */
  addLabel: string;
  /** Accessible name for that button when not yet added (e.g. "Add Fajr to my habits"). */
  addAccessibilityLabel: string;
  /** Accessible name + hint for the tap-to-expand row body. */
  rowAccessibilityLabel: string;
  expandHint: string;
  collapseHint?: string;
  /** The revealed detail — evidence text, a habit sequence, etc. */
  children: ReactNode;
};

/**
 * A Discover library row: a tap-to-expand body (the "why"/"what's inside") plus a separate,
 * always-visible {@link AddPill} so adding is one tap and never requires expanding first.
 * The expanded body ends with a full-width add button. Backs both {@link SunnahPresetRow}
 * and {@link SunnahRoutineRow}, which were otherwise near-identical. Visually matches
 * {@link SettingsRow}.
 */
export function ExpandableAddRow({
  title,
  subtitle,
  added,
  onAdd,
  itemLabel,
  addLabel,
  addAccessibilityLabel,
  rowAccessibilityLabel,
  expandHint,
  collapseHint = 'Collapse details',
  children,
}: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  // Expanding to read the detail is plain disclosure with clear visual feedback — no haptic.
  const toggle = () => setExpanded((v) => !v);

  const add = () => {
    if (added) return;
    haptics.added();
    onAdd();
  };

  return (
    <View>
      <View style={styles.row}>
        {/* Row body = "learn more". The Add pill (sibling) = "add". */}
        <Pressable
          onPress={toggle}
          android_ripple={{ color: theme.backgroundSelected }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={rowAccessibilityLabel}
          accessibilityHint={expanded ? collapseHint : expandHint}
          style={({ pressed }) => [styles.expand, pressed && styles.pressed]}>
          <View style={styles.labels}>
            <ThemedText type="default" numberOfLines={1}>
              {title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          </View>
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={theme.textSecondary} />
        </Pressable>
        <AddPill added={added} onPress={add} label={itemLabel} />
      </View>

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(Duration.base)}
          exiting={FadeOut.duration(Duration.fast)}
          style={styles.detail}>
          {children}
          <PressableScale
            onPress={add}
            disabled={added}
            android_ripple={added ? undefined : { color: theme.rippleOnFill }}
            accessibilityRole="button"
            accessibilityState={{ disabled: added }}
            accessibilityLabel={added ? `${itemLabel} added` : addAccessibilityLabel}
            style={[styles.button, { backgroundColor: added ? theme.successSubtle : theme.accent }]}>
            <ThemedText type="smallBold" numberOfLines={1} style={{ color: added ? theme.success : theme.accentText }}>
              {added ? ADDED_LABEL : addLabel}
            </ThemedText>
          </PressableScale>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.three,
    gap: Spacing.two,
  },
  // The tap-to-expand area owns the left padding so its ripple/press dim reaches the edge.
  expand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  labels: { flex: 1, gap: Spacing.half },
  pressed: { opacity: Pressed.dim },
  detail: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    paddingTop: Spacing.one,
    gap: Spacing.two,
  },
  button: {
    marginTop: Spacing.one,
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
