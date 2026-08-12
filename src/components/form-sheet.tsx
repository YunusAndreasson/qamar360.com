import { Fragment } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
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
 *
 * iOS only: `fitToContents` there sizes the sheet against the JS content alone, so the inset
 * has to be added by hand or the last row sits under the home indicator. Android's own
 * `BottomSheetDialog` already avoids the bottom inset itself (see react-native-screens'
 * `BottomSheetWindowInsetListenerChain`) — adding it again here double-counted it, leaving a
 * dead gap between the sheet and the tab bar below it.
 */
export function FormSheet({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const paddingBottom = Platform.OS === 'android' ? Spacing.two : insets.bottom + Spacing.two;
  return (
    <View style={[styles.sheet, { paddingBottom }]}>
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

/** One row of a {@link SheetActions} card — a {@link SheetRow}'s props as data. */
export type SheetAction = {
  icon: IconName;
  label: string;
  sublabel?: string;
  danger?: boolean;
  onPress: () => void;
};

/**
 * The grouped card a form sheet's rows live in: one {@link Surface}, its rows joined by
 * {@link RowSeparator}. `null` entries are dropped, so a row that only some records have is
 * written inline (`exchange ? null : {…}`) rather than as a JSX fragment holding its own separator.
 *
 * It exists because both option sheets — an act's or an exchange's (`act-actions`) and a stack's
 * (`stack-manage`) — used to hand-interleave rows and separators, and hand-assembly is exactly how
 * two sheets that must look like one object drift apart. Composed as data, a row added to one is
 * spelled the same way in the other, and they can only ever share a shape.
 */
export function SheetActions({ actions }: { actions: (SheetAction | null)[] }) {
  const rows = actions.filter((a) => a !== null);
  return (
    <Surface>
      {rows.map((action, i) => (
        <Fragment key={action.label}>
          {i > 0 ? <RowSeparator /> : null}
          <SheetRow {...action} />
        </Fragment>
      ))}
    </Surface>
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
    minHeight: 48, // Android's Material minimum tap target (also clears iOS's 44pt)
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
