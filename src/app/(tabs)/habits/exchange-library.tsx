import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { type CuratedExchange, EXCHANGE_GROUPS } from '@/constants/exchanges';
import { Face, Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { DAILY_SCHEDULE } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { normalizeName } from '@/lib/names';

/**
 * The library of ready-made exchanges.
 *
 * Each card shows the whole plan before you commit to it — the moment, the routine it displaces,
 * the deed that takes its place, what counts as done, and where the claim comes from. That order
 * is the point: an exchange is only as good as the moment it names, so the moment leads.
 *
 * Adding is idempotent the way the stack library's is: an exchange whose deed you already track
 * reads as yours and offers nothing to add, so a second visit can't mint a near-duplicate.
 */
export default function ExchangeLibraryScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { habits, createHabits, deleteHabit } = useHabits();

  // Folded habit names — the dedupe key everywhere in the app. (No useMemo: the React Compiler
  // memoizes derived values.)
  const owned = new Set(habits.map((h) => normalizeName(h.name)));

  const add = async (entry: CuratedExchange) => {
    const created = await createHabits([
      {
        name: entry.name,
        instead_of: entry.insteadOf,
        cue: entry.cue,
        // Every curated exchange is daily: an urge does not take the weekend off. The form and
        // the editor can narrow it afterwards.
        schedule_days: DAILY_SCHEDULE,
      },
    ]);
    if (created.length === 0) return; // createHabits already surfaced the error
    haptics.added();
    show(`Added ${entry.name} — find it on Today`, 'success', {
      label: 'Undo',
      onPress: () => {
        for (const habit of created) void deleteHabit(habit.id);
      },
    });
  };

  return (
    <AppScreen>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        Put a good act where an old one keeps happening — the same moment, a different answer.
      </ThemedText>

      {EXCHANGE_GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <SectionLabel>{group.title}</SectionLabel>
          <ThemedText type="small" themeColor="textDisabled" style={styles.blurb}>
            {group.blurb}
          </ThemedText>
          {group.exchanges.map((entry) => (
            <ExchangeCard
              key={entry.id}
              entry={entry}
              owned={owned.has(normalizeName(entry.name))}
              onAdd={() => void add(entry)}
            />
          ))}
        </View>
      ))}

      <View style={styles.group}>
        <Surface>
          <SettingsRow
            icon="exchange"
            label="Write your own"
            sublabel="Name the moment, the routine, and what you do instead"
            onPress={() => router.replace({ pathname: '/habits/exchange', params: { id: 'new' } })}
          />
          <RowSeparator />
          <SettingsRow
            icon="help"
            label="Why replacing works"
            sublabel="The short version, with the Sunnah behind it"
            onPress={() => router.push('/habits/exchange-info')}
          />
        </Surface>
      </View>
    </AppScreen>
  );
}

/**
 * One ready-made exchange, shown whole. The plan is set as a single sentence across three lines —
 * moment, displaced routine, deed — because that is the shape you have to be able to recall in
 * the moment itself, and reading it here is the first rehearsal of it.
 */
function ExchangeCard({ entry, owned, onAdd }: { entry: CuratedExchange; owned: boolean; onAdd: () => void }) {
  const theme = useTheme();

  return (
    <View style={styles.card}>
      <Surface>
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <AppIcon name="exchange" size={22} color={theme.textSecondary} />
            <ThemedText type="rowTitle" style={styles.cardTitle}>
              {entry.name}
            </ThemedText>
          </View>
          <View style={styles.plan}>
            <ThemedText type="small" themeColor="textSecondary">
              {entry.cue.charAt(0).toUpperCase() + entry.cue.slice(1)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`Instead of ${entry.insteadOf}`}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textDisabled">
            {entry.detail}
          </ThemedText>
          <ThemedText type="small" themeColor="textDisabled">
            {entry.evidence}
          </ThemedText>
          {owned ? (
            <View style={styles.added}>
              <AppIcon name="check" size={16} color={theme.textDisabled} />
              <ThemedText type="small" themeColor="textDisabled">
                Already yours
              </ThemedText>
            </View>
          ) : (
            <AppButton
              variant="secondary"
              onPress={onAdd}
              accessibilityLabel={`Add the exchange: ${entry.name} instead of ${entry.insteadOf}`}
              accessibilityHint={`Adds it to today, ${entry.cue}.`}>
              Add this exchange
            </AppButton>
          )}
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  lede: { marginHorizontal: Spacing.three, marginBottom: Spacing.four },
  group: { marginBottom: Spacing.four },
  // Hung to the section label's inset, and given air before the first card so it reads as the
  // group's line rather than the first card's.
  blurb: { marginLeft: Spacing.three, marginTop: Spacing.half, marginBottom: Spacing.two },
  card: { marginBottom: Spacing.two },
  cardBody: { padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Semibold via the FACE, never fontWeight (the Android fake-bold gotcha).
  cardTitle: { flex: 1, fontFamily: Face.bodySemiBold },
  // The two halves of the plan set as one block, apart from the detail and evidence below.
  plan: { gap: Spacing.half, paddingVertical: Spacing.one },
  added: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
});
