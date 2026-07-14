import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import { haptics } from '@/lib/haptics';

/**
 * "Manage stack" — a native bottom sheet raised by tapping a stack card's header (the ⋯). It
 * holds the things you can't do to a stack by direct manipulation on Today: add habits to it,
 * rename it, or delete it (members are removed/reordered by dragging the card). Presented
 * `fitToContents` from the habits stack layout — the same compact sheet-of-rows as "Add to
 * stack". Add habits and Rename hand off to their own modals so no keyboard or list has to
 * live inside the sheet.
 */
export default function StackManageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { stacks, deleteStack } = useHabits();

  const stack = stacks.find((s) => s.id === id) ?? null;

  // `replace` (not push) so the next modal's Save/Close returns to the list, not back to
  // this sheet.
  const addHabits = () => {
    if (!stack) return;
    router.replace({ pathname: '/habits/discover', params: { stackId: stack.id } });
  };

  const rename = () => {
    if (!stack) return;
    router.replace({ pathname: '/habits/stack-rename', params: { id: stack.id } });
  };

  const confirmDelete = () => {
    if (!stack) return;
    // Deleting drops the stack from state; the effect below backs the sheet out (don't also
    // router.back() here, or it pops twice).
    confirmDestructive({
      title: 'Delete stack',
      message: `Delete “${stack.name}”? The habits stay; only the grouping is removed.`,
      onConfirm: () => {
        haptics.removed();
        void deleteStack(stack.id);
      },
    });
  };

  // Managing a stack that no longer exists (deleted here or elsewhere): close.
  useEffect(() => {
    if (id && !stack) router.back();
  }, [id, stack, router]);
  if (!stack) return null;

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
      <View style={styles.header}>
        <ThemedText type="heading" numberOfLines={1}>
          {stack.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Stack
        </ThemedText>
      </View>

      <Surface>
        <ActionRow icon="add" label="Add habits" onPress={addHabits} />
        <RowSeparator />
        <ActionRow icon="edit" label="Rename" onPress={rename} />
        <RowSeparator />
        <ActionRow icon="delete" label="Delete stack" danger onPress={confirmDelete} />
      </Surface>
    </View>
  );
}

/** One tappable action in the manage sheet: a leading glyph + a label; `danger` tints it red. */
function ActionRow({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: IconName;
  label: string;
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
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <AppIcon name={icon} size={22} color={danger ? theme.danger : theme.textSecondary} />
      <ThemedText type="rowTitle" numberOfLines={1} style={[styles.rowText, danger ? { color: theme.danger } : null]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Padded content of a `fitToContents` sheet — the grabber sits above this; the safe-area bottom
  // inset is added inline so the last row clears the home indicator.
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
  rowText: { flex: 1 },
});
