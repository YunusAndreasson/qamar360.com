import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { DisclosureRow } from '@/components/disclosure-row';
import { GuideIntro } from '@/components/guide-intro';
import { LibraryCard } from '@/components/library-card';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { type CuratedExchange, EXCHANGE_GROUPS } from '@/constants/exchanges';
import { EXCHANGE_GUIDE } from '@/constants/guides';
import { Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { DAILY_SCHEDULE } from '@/lib/dates';
import { exchangePlanLine } from '@/lib/exchange';
import { haptics } from '@/lib/haptics';
import { normalizeName } from '@/lib/names';

/**
 * Add an exchange: your own, or one of the ready-made ones.
 *
 * Laid out as "Add a stack" is, and for the same reasons: one line on what an exchange is, your
 * own as the first row, then the ready-made ones under plain headings. Each card is the deed and,
 * quietly beneath it, the plan in the day row's own words (`instead of soft drinks · sitting down
 * to eat`); what counts as done and the evidence sit one tap down.
 *
 * Adding is idempotent the way the stack library's is: an exchange whose deed you already track
 * reads as yours and offers nothing to add, so a second visit can't mint a near-duplicate.
 */
export default function ExchangeLibraryScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { habits, createHabits, deleteHabit } = useHabits();

  // Folded names of the loose habits — the container an exchange lands in, and the same set the
  // exchange form checks a name against (`siblingNames(habits, null)`). An act of the same name
  // inside a stack is another row, so it must not make a card read "Already yours". (No useMemo:
  // the React Compiler memoizes derived values.)
  const owned = new Set(habits.filter((h) => h.stack_id === null).map((h) => normalizeName(h.name)));

  // The from-scratch door, offered once, ahead of the ready-made cards. `push`, like the stack
  // library's and Discover's: Cancel steps back here, Create closes the flow onto the day.
  const goCreateExchange = () => router.push({ pathname: '/habits/exchange', params: { id: 'new' } });

  // The card being added, while its write is in flight: "owned" is read off the habits, so a second
  // tap before the first landed would add the same exchange twice.
  // State draws the busy pill; the ref is the guard, since two taps can land before a re-render.
  const [adding, setAdding] = useState<string | null>(null);
  const addingRef = useRef(false);
  const add = async (entry: CuratedExchange) => {
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(entry.id);
    try {
      await addExchange(entry);
    } finally {
      addingRef.current = false;
      setAdding(null);
    }
  };

  const addExchange = async (entry: CuratedExchange) => {
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
    show(`Added ${entry.name} to Today`, 'success', {
      label: 'Undo',
      onPress: () => {
        for (const habit of created) void deleteHabit(habit.id);
      },
    });
  };

  return (
    <AppScreen contentStyle={styles.content}>
      {/* What an exchange is, in one line, with the argument one tap down. */}
      <GuideIntro guide={EXCHANGE_GUIDE} />

      {/* Your own first, as on "Add a stack": one row, ahead of the suggestions. */}
      <SettingsSection>
        <SettingsRow
          icon="add"
          label="Your own exchange"
          sublabel="The moment, and what you do instead"
          onPress={goCreateExchange}
          showChevron
        />
      </SettingsSection>

      {EXCHANGE_GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <SectionLabel>{group.title}</SectionLabel>
          {group.exchanges.map((entry) => (
            <ExchangeCard
              key={entry.id}
              entry={entry}
              owned={owned.has(normalizeName(entry.name))}
              busy={adding === entry.id}
              onAdd={() => void add(entry)}
            />
          ))}
        </View>
      ))}
    </AppScreen>
  );
}

/**
 * One ready-made exchange: the deed, the plan in one line, and the rest one tap down.
 *
 * The plan is in the Today row's own grammar — `instead of soft drinks · sitting down to eat`,
 * from the same function — so recognising an entry here rehearses exactly what you will read
 * later. What counts as done and the evidence behind it fold under "Details", as a Discover row's
 * chevron folds the same two things: read once when deciding, never needed to scan. The bar used to
 * sit open on every card as a second grey paragraph, which with the plan line and the evidence row
 * made four tiers under each name. Nothing is deleted: honest per-entry sourcing is a promise this
 * library makes, so it stays one tap away.
 */
function ExchangeCard({
  entry,
  owned,
  busy,
  onAdd,
}: {
  entry: CuratedExchange;
  owned: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <LibraryCard
      title={entry.name}
      owned={owned}
      action={{
        onPress: onAdd,
        busy,
        accessibilityLabel: `Add the exchange: ${entry.name} instead of ${entry.insteadOf}`,
        // "Its moment:" rather than running the cue straight on, now that a cue is the bare
        // moment ("headphones on") instead of a "when I…" clause that could finish a sentence.
        accessibilityHint: `Adds it to today. Its moment: ${entry.cue}.`,
      }}>
      <ThemedText type="small" themeColor="textSecondary">
        {exchangePlanLine(entry.insteadOf, entry.cue)}
      </ThemedText>
      {/* `DisclosureRow`, never a gesture-handler `Touchable`: inside a Surface that one latches
          and never fires (see the component's note). */}
      <DisclosureRow
        label="Details"
        dense
        accessibilityLabel={`Details: ${entry.name}`}
        expandHint="Shows what counts as done and the evidence."
        collapseHint="Hides the details.">
        <View style={styles.details}>
          <ThemedText type="small">{entry.detail}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.evidence}>
            {entry.evidence}
          </ThemedText>
        </View>
      </DisclosureRow>
    </LibraryCard>
  );
}

const styles = StyleSheet.create({
  // 24 between groups — the step Settings and Discover keep between their sections.
  content: { gap: Spacing.four },
  // 8 from the caption to its first card and between cards: the app's caption→card beat.
  group: { gap: Spacing.two },
  // The bar, then its source: two paragraphs, a beat apart.
  details: { gap: Spacing.two },
  // Set apart from the bar above it the way Discover's detail sets its evidence apart.
  evidence: { fontStyle: 'italic' },
});
