import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

/**
 * The scaffold for a `fitToContents` native form sheet (see {@link formSheetOptions}) — the
 * compact sheet-of-rows idiom shared by "Add", "Add to stack" and "Manage stack". One padded
 * container and one heading treatment, so every sheet hangs its title and clears the home
 * indicator identically. The grabber sits above the top padding; the safe-area bottom inset
 * (+ a small gap) is added inline so the last row clears the indicator without a slab of
 * dead space beneath it.
 */
export function FormSheet({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
      <View style={styles.header}>
        <ThemedText type="heading" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * One tappable row inside a form sheet's grouped card: a leading glyph, a title, an optional
 * muted sub-line, `danger` tinting for destructive actions. Rows that *navigate or pick* stay
 * silent (the haptic vocabulary never buzzes navigation); the destination action confirms.
 */
export function SheetRow({
  icon,
  label,
  sublabel,
  danger,
  onPress,
}: {
  icon: IconName;
  label: string;
  sublabel?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={sublabel}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <AppIcon name={icon} color={danger ? theme.danger : theme.textSecondary} />
      <View style={styles.rowText}>
        <ThemedText type="rowTitle" numberOfLines={1} style={danger ? { color: theme.danger } : null}>
          {label}
        </ThemedText>
        {sublabel ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {sublabel}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44, // the iOS-standard row height + minimum tap target
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
