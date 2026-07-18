import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The habit-stacking guide — a short educational sheet: what stacking is, the evidence behind
 * it, and how to do it here (drag one habit onto another on Today). One shared body behind two
 * thin routes — `habits/stacking-info` (the Today hint) and `settings/stacking-info` (Settings →
 * About) — so opening it never switches tabs. Presented `fitToContents` (see `formSheetOptions`);
 * the sheet doesn't scroll, so the copy stays these four short blocks.
 */
export function StackingGuide() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
      <View style={styles.header}>
        <AppIcon name="stack" color={theme.accent} />
        <ThemedText type="heading">Habit stacking</ThemedText>
      </View>

      <ThemedText type="default">
        The easiest way to grow a new habit is to attach it to one you already keep. The habit you
        never miss becomes the cue for the one you’re building: after I pray Fajr, I read one page.
      </ThemedText>
      <ThemedText type="default">
        Psychologists call these if–then plans “implementation intentions” — deciding the when in
        advance roughly doubles follow-through. Atomic Habits made the idea famous as habit
        stacking.
      </ThemedText>
      <ThemedText type="default">
        And you already have the strongest anchors there are: the five daily prayers — fixed
        moments spread through every day. A stack tied to one of them almost keeps itself.
      </ThemedText>
      <ThemedText type="default">
        <ThemedText type="defaultSemiBold">Try it. </ThemedText>
        On Today, drag one habit onto another and hold for a beat — they fold into a stack. Drop
        more habits onto the card to grow the sequence, in the order you’ll do them.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Padded content of a `fitToContents` sheet — the grabber sits above this; the safe-area
  // bottom inset is added inline so the last block clears the home indicator.
  sheet: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
