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
 * The sheet asks **one** question: what kind of thing is this? So each card names its noun —
 * stack, exchange, task — rather than describing an action ("Build your own", which never said
 * your own *what*), and the two captions above them answer the only thing the nouns can't: does
 * it come back tomorrow, or not?
 *
 * It used to offer four choices, two of which ("Ready-made stack", "Your own stack") were both
 * stacks — so before you could say what you wanted you had to say how you wanted to make it, and
 * the second card competed with a row that already exists inside the library the first one opens.
 * Both stack doors now live behind one card, where the choice between them can be made with the
 * ready-made ones actually in view.
 *
 * REPEATING: a stack adds a deed to the day; an exchange puts one where an old routine keeps
 * taking its place. The exchange sits second because it presumes what the stack doesn't — that you
 * have already noticed a specific moment going the wrong way.
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
            icon="stack"
            label="Stack"
            sublabel="A short sequence anchored to a prayer, waking, or bedtime."
            onPress={() => router.replace('/habits/stack-library')}
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
