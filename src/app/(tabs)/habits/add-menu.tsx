import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { FormSheet } from '@/components/form-sheet';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * "Add" — the native bottom sheet behind Today's "+": the fork between adding a single habit
 * and starting a stack. Rather than the compact row-list of "Manage stack", the two choices are
 * given room to breathe as separate cards — each an icon chip, a title, and a one-line
 * explanation so the choice teaches the vocabulary as it's made. Presented `fitToContents` from
 * the habits stack layout. `replace` (not push) hands off to the next modal so dismissing it
 * returns to Today, not back to this sheet.
 */
export default function AddMenuScreen() {
  const router = useRouter();

  return (
    <FormSheet title="Add">
      <View style={styles.choices}>
        <ChoiceCard
          icon="add"
          label="New habit"
          sublabel="A single habit to track on its own."
          onPress={() => router.replace('/habits/discover')}
        />
        <ChoiceCard
          icon="stack"
          label="New stack"
          sublabel="A group of habits, done in order."
          onPress={() => router.replace('/habits/stack-new')}
        />
      </View>
    </FormSheet>
  );
}

/** One choice: an icon chip, a title, a muted explanation, and a chevron hinting it opens next. */
function ChoiceCard({
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
    <Surface>
      <Pressable
        onPress={onPress}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={sublabel}
        style={({ pressed }) => [styles.card, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
          <AppIcon name={icon} color={theme.textSecondary} />
        </View>
        <View style={styles.cardText}>
          <ThemedText type="rowTitle" numberOfLines={1}>
            {label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {sublabel}
          </ThemedText>
        </View>
        <AppIcon name="chevronRight" size={18} color={theme.textSecondary} />
      </Pressable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  choices: {
    gap: Spacing.two,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  chip: {
    width: 44,
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: Spacing.half },
});
