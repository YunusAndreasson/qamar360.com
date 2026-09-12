import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { DisclosureRow } from '@/components/disclosure-row';
import { headerNewAction } from '@/components/form-header-actions';
import { GuideIntro } from '@/components/guide-intro';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { type CuratedExchange, EXCHANGE_GROUPS } from '@/constants/exchanges';
import { EXCHANGE_GUIDE } from '@/constants/guides';
import { Face, Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { DAILY_SCHEDULE } from '@/lib/dates';
import { exchangePlanLine } from '@/lib/exchange';
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

  // The from-scratch door, named once and offered twice — from the nav bar and from the closing
  // row. `replace` for the same reason the stack library's does: the library and the blank form
  // answer one question, so back belongs to the "+" sheet, not to the library again.
  const goCreateExchange = () => router.replace({ pathname: '/habits/exchange', params: { id: 'new' } });

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
      {/* "Custom" opposite the route's Close — the sibling of the stack library's, same reasoning. */}
      <Stack.Screen
        options={{ headerRight: headerNewAction('Custom', 'Build your own exchange', goCreateExchange) }}
      />

      {/* The case for replacing rather than resisting, at the head of the screen where the
          replacement is chosen. Its disclosure is labelled "Why replacing works", not "Why this
          works" — the cards below each carry that phrase for their own evidence. */}
      <GuideIntro guide={EXCHANGE_GUIDE} />

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

      {/* The from-scratch path. The "why" that used to sit beside it now opens the screen. */}
      <View style={styles.group}>
        <Surface>
          <SettingsRow
            icon="exchange"
            label="Your own exchange"
            sublabel="The moment, the routine you turn from, and the deed instead"
            onPress={goCreateExchange}
          />
        </Surface>
      </View>
    </AppScreen>
  );
}

/**
 * One ready-made exchange: the deed, the plan in one line, what counts as done — and the evidence
 * behind a disclosure.
 *
 * It used to show all five blocks at once, which made ten of these a wall of prose two thumbs
 * deep: the citations run to three lines each, so the thing you are actually choosing between (is
 * this pairing mine?) was outweighed about four to one by material you read at most once. The
 * plan is now one line in the row's own grammar — `soft drinks · when I sit down to eat`, the same
 * string the Today row shows — so recognising an entry here rehearses exactly what you will read
 * later. Nothing is deleted: honest per-entry sourcing (hadith graded, trial named) is a promise
 * this library makes, so it stays one tap away rather than being cut.
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
          {/* The plan, in the Today row's exact grammar — from the same function, so "exact" is
              enforced rather than asked for. */}
          <ThemedText type="small" themeColor="textSecondary">
            {exchangePlanLine(entry.insteadOf, entry.cue)}
          </ThemedText>
          <ThemedText type="small" themeColor="textDisabled">
            {entry.detail}
          </ThemedText>
          {/* Per-entry sourcing, one tap down. `DisclosureRow` is the shared row this card used to
              hand-roll — it carries the `Pressable`-not-`Touchable` finding that made it work
              inside a Surface, and the intro at the top of this screen now uses it too. */}
          <DisclosureRow
            label="Why this works"
            accessibilityLabel={`Why this works: ${entry.name}`}
            expandHint="Shows the evidence behind it."
            collapseHint="Hides the evidence.">
            <ThemedText type="small" themeColor="textSecondary">
              {entry.evidence}
            </ThemedText>
          </DisclosureRow>
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
              // "Its moment:" rather than running the cue straight on, now that a cue is the bare
              // moment ("headphones on") instead of a "when I…" clause that could finish a sentence.
              accessibilityHint={`Adds it to today. Its moment: ${entry.cue}.`}>
              Add this exchange
            </AppButton>
          )}
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: Spacing.four },
  // Hung to the section label's inset, and given air before the first card so it reads as the
  // group's line rather than the first card's.
  blurb: { marginLeft: Spacing.three, marginTop: Spacing.half, marginBottom: Spacing.two },
  card: { marginBottom: Spacing.two },
  cardBody: { padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Semibold via the FACE, never fontWeight (the Android fake-bold gotcha).
  cardTitle: { flex: 1, fontFamily: Face.bodySemiBold },
  added: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
});
