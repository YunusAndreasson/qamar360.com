import { StyleSheet, View } from 'react-native';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** One streak figure — a big tabular number over a quiet caption. */
function Figure({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <View style={styles.figure}>
      <ThemedText type="subtitle" style={[styles.value, { color: tone }]}>
        {value}
      </ThemedText>
      <ThemedText type="smallCompact" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/**
 * Current + longest streak, framed kindly. A streak motivates, but the research is clear that a
 * single missed day doesn't undo a forming habit — so a break is never scolded (skipped days are
 * excused, and today stays "pending" until it closes). At zero the readout invites a fresh start
 * rather than announcing a failure. Days are counted on the habit's own schedule, so a
 * Monday/Thursday habit isn't "broken" by the days it was never due.
 */
export function HabitStreakCard({ currentStreak, longestStreak }: { currentStreak: number; longestStreak: number }) {
  const theme = useTheme();
  const readout =
    currentStreak > 0 ? `${currentStreak} ${currentStreak === 1 ? 'day' : 'days'} going` : 'Every day you return counts.';

  return (
    <StatCard>
      <View style={styles.head}>
        <StatCardHeader title="Streak" />
        <StatReadout text={readout} refreshKey={currentStreak} />
      </View>
      {/* Subject on the left, reference on the right — and the left one is the brighter, which is
          the rule the reading card's quarter-on-quarter pair also keeps ("this quarter" in `text`,
          "last quarter" muted). It was the other way round here: `longest` sat in full `text` while
          a `current` of 0 sat in `textSecondary`, so a pair whose whole point is the streak you are
          on gave its weight to the one you are not. `accent` stays for a live streak — the app's
          "this is running" tone, the same one the open ring on the day wears. */}
      <View style={styles.figures}>
        <Figure value={currentStreak} label="current" tone={currentStreak > 0 ? theme.accent : theme.text} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Figure value={longestStreak} label="longest" tone={theme.textSecondary} />
      </View>
    </StatCard>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.two },
  figures: { flexDirection: 'row', alignItems: 'center' },
  figure: { flex: 1, alignItems: 'center', gap: Spacing.half },
  value: { fontVariant: ['tabular-nums'] },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: Spacing.one },
});
