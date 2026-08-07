import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { FadeInView } from '@/components/fade-in-view';
import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { type CuratedExchange, EXCHANGE_GROUPS } from '@/constants/exchanges';
import { Face, Pressed, Spacing } from '@/constants/theme';
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
            label="Your own exchange"
            sublabel="The moment, the routine you turn from, and the deed instead"
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
  const [showEvidence, setShowEvidence] = useState(false);

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
          {/* The disclosure. A quiet text row, not a chevron-and-divider affair — it is the least
              of the three things on the card and must not out-dress the plan above it.

              RN `Pressable`, not gesture-handler's `Touchable`, which is what the rest of the day's
              rows use: inside this card's Surface the Touchable took the press (its underlay lit and
              latched) and never fired `onPress` on release — verified twice on device, with and
              without the underlay. `Pressable` is what `SettingsRow` uses lower down this same
              screen, where tapping has always worked. */}
          <Pressable
            onPress={() => setShowEvidence((v) => !v)}
            android_ripple={{ color: theme.backgroundSelected }}
            accessibilityRole="button"
            accessibilityState={{ expanded: showEvidence }}
            accessibilityLabel={`Why this works: ${entry.name}`}
            accessibilityHint={showEvidence ? 'Hides the evidence.' : 'Shows the evidence behind it.'}
            style={({ pressed }) => [styles.whyRow, pressed && { opacity: Pressed.dim }]}>
            <ThemedText type="small" themeColor="textDisabled">
              Why this works
            </ThemedText>
            <AppIcon name={showEvidence ? 'expandLess' : 'expandMore'} size={16} color={theme.textDisabled} />
          </Pressable>
          {/* A shared-value mount fade, never reanimated `entering` — the SDK 57 Fabric preset bug
              (see FadeInView). */}
          {showEvidence ? (
            <FadeInView>
              <ThemedText type="small" themeColor="textDisabled">
                {entry.evidence}
              </ThemedText>
            </FadeInView>
          ) : null}
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
  // The evidence toggle: a 44pt row so it is a real target, its glyph bound to its label.
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, minHeight: 44 },
  added: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
});
