import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The habit-stacking guide — the short case for the way the whole app works: anchor to a cue you
 * already keep, read the sequence until you know it, finish it in one go. One shared body behind
 * two thin routes — `habits/stacking-info` and `settings/stacking-info` (Settings → About) — so
 * opening it never switches tabs. Presented `fitToContents` (see `formSheetOptions`); the sheet
 * doesn't scroll, so the copy stays these four short blocks.
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
        <ThemedText type="defaultSemiBold">Anchor, don’t add. </ThemedText>
        A stack attaches a good deed to something already fixed in your day: after Fajr, I read one
        page. Behavioral research calls this an if–then plan — a new act hung on an old, automatic
        cue is far likelier to survive than one floating loose.
      </ThemedText>
      <ThemedText type="default">
        This pattern appears in the authentic Sunnah. The Prophet ﷺ taught remembrances after each
        prescribed prayer (Muslim 596), and Bilal (may Allah be pleased with him) regularly prayed
        after making wudu (Bukhari 1149).
      </ThemedText>
      <ThemedText type="default">
        <ThemedText type="defaultSemiBold">Read it until you know it. </ThemedText>
        A stack’s acts aren’t a checklist to tick one by one — they’re a short sequence to learn.
        Read it each time you open the app, and before long you won’t need to.
      </ThemedText>
      <ThemedText type="default">
        <ThemedText type="defaultSemiBold">Finish it in one go. </ThemedText>
        One tap seals the whole stack — that’s the only thing the app records. The Prophet ﷺ taught
        that the deeds most beloved to Allah are those kept consistently, even when small (Bukhari
        6464); keep the sequence short enough that you can always finish it.
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
