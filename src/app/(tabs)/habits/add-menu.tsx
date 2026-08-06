import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { FormSheet } from '@/components/form-sheet';
import { SectionLabel } from '@/components/section-label';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * "Add" — the native bottom sheet behind Today's "+".
 *
 * Four choices, and the whole point of the sheet is that you leave it knowing which of the app's
 * four things you just made. So each card **names its noun** — stack, exchange, task — rather than
 * describing an action ("Build your own", which never said your own *what*), and the two captions
 * above them answer the question the nouns can't: does this thing come back tomorrow, or not?
 *
 * REPEATING: the first two make a *stack* — take one ready-made, or start an empty one and add
 * acts into it. The ready-made path leads, since an anchor someone else has already thought
 * through beats a blank name field for almost everyone. The exchange is a different shape of
 * change altogether — not a deed added to the day but one put where an old routine keeps taking
 * its place — and sits last of the three because it presumes what the others don't: that you have
 * already noticed a specific moment going the wrong way.
 *
 * ONE-OFF: the task, which asks nothing of the future. It is the only choice that leads back to
 * Today instead of on to a form — a task is a line you type, so the field is the row it becomes.
 *
 * The choices are given room to breathe as separate cards — an icon chip, a noun, and a one-line
 * explanation, so the choice teaches the vocabulary as it's made. Presented `fitToContents` from
 * the habits stack layout. `replace` (not push) hands off to the next modal so dismissing it
 * returns to Today, not back to this sheet.
 */
export default function AddMenuScreen() {
  const router = useRouter();

  return (
    <FormSheet title="Add">
      <View style={styles.group}>
        <SectionLabel>REPEATING</SectionLabel>
        <View style={styles.choices}>
          <ChoiceCard
            icon="sparkle"
            label="Ready-made stack"
            sublabel="A short sequence anchored to a prayer, waking, or bedtime."
            onPress={() => router.replace('/habits/stack-library')}
          />
          <ChoiceCard
            icon="stack"
            label="Your own stack"
            sublabel="Name it, anchor it to a moment, then add your acts."
            onPress={() => router.replace('/habits/stack-new')}
          />
          <ChoiceCard
            icon="exchange"
            label="Exchange"
            sublabel="Put a good act where an old one keeps happening."
            onPress={() => router.replace('/habits/exchange-library')}
          />
        </View>
      </View>

      <View style={styles.group}>
        <SectionLabel>ONE-OFF</SectionLabel>
        <ChoiceCard
          icon="task"
          label="Task"
          sublabel="Something to do once, not to keep."
          // `dismissTo`, not `replace`: this one goes *back* down the stack to the day itself
          // (carrying the param), where `replace` would stack a second Today on top of the sheet.
          onPress={() => router.dismissTo({ pathname: '/habits', params: { compose: 'task' } })}
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
        <AppIcon name="chevronRight" size={16} color={theme.textSecondary} />
      </Pressable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  // Caption → its cards, at the same 8pt beat every section caption on Today keeps.
  group: { gap: Spacing.two },
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
