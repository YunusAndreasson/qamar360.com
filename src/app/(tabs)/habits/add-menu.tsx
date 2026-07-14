import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * "Add" — the native bottom sheet behind Today's "+": the fork between adding a single habit
 * and starting a stack. Each row carries a one-line explanation so the choice teaches the
 * vocabulary as it's made. Presented `fitToContents` from the habits stack layout, the same
 * compact sheet-of-rows as "Manage stack". `replace` (not push) hands off to the next modal so
 * dismissing it returns to Today, not back to this sheet.
 */
export default function AddMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
      <View style={styles.header}>
        <ThemedText type="heading">Add</ThemedText>
      </View>

      <Surface>
        <ChoiceRow
          icon="add"
          label="New habit"
          sublabel="A single habit to track."
          onPress={() => router.replace('/habits/discover')}
        />
        <RowSeparator />
        <ChoiceRow
          icon="stack"
          label="New stack"
          sublabel="A group of habits, in order."
          onPress={() => router.replace('/habits/stack-new')}
        />
      </Surface>
    </View>
  );
}

/** One choice in the sheet: a leading glyph, a title, and a muted explanation line. */
function ChoiceRow({
  icon,
  label,
  sublabel,
  onPress,
}: {
  icon: IconName;
  label: string;
  sublabel: string;
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
      <AppIcon name={icon} size={22} color={theme.textSecondary} />
      <View style={styles.rowText}>
        <ThemedText type="rowTitle" numberOfLines={1}>
          {label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {sublabel}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Padded content of a `fitToContents` sheet — the grabber sits above this, the safe-area bottom
  // inset (+ a small gap) is added inline so the last row clears the home indicator without a slab
  // of dead space beneath it.
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
  rowText: { flex: 1, gap: 2 },
});
