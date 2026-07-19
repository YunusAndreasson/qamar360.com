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
        A habit stack gives a good deed a clear cue: after Fajr, I read one page. Behavioral
        research calls this an if–then plan. Repeating a small action after the same cue can make it
        easier to begin and remember.
      </ThemedText>
      <ThemedText type="default">
        This pattern appears in the authentic Sunnah. The Prophet ﷺ taught remembrances after each
        prescribed prayer (Muslim 596), and Bilal (may Allah be pleased with him) regularly prayed
        after making wudu (Bukhari 1149).
      </ThemedText>
      <ThemedText type="default">
        The Prophet ﷺ taught that the deeds most beloved to Allah are those kept consistently, even
        when small (Bukhari 6464). Some early Muslims said, “Among the rewards of a good deed is the
        good deed that follows it.”
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
