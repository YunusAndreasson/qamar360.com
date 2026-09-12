import { StyleSheet, View } from 'react-native';

import { MoonPhase } from '@/components/moon-phase';
import { QUIET_MOON } from '@/components/reading-card';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { spanLabel, waitLabel, type nextReadingDue } from '@/lib/insights';

/** What {@link nextReadingDue} answers with — the card takes it whole rather than restating it. */
type Due = NonNullable<ReturnType<typeof nextReadingDue>>;

/**
 * When the next reading arrives — the one thing this tab could not previously tell you.
 *
 * The feed is a record of nights you were already told about, so with a reading in hand the
 * obvious question is when the next one lands, and the answer was nowhere on the screen: the
 * schedule is four moons a month, which is knowable, and leaving it unsaid turns a deliberate
 * rhythm into a surprise you wait for. (Nielsen's first heuristic, and the one an offline,
 * lunar-paced feature is most likely to break.) The empty state alone said it, and only in prose
 * — so the state that knew the least was the only state that explained itself.
 *
 * **Deliberately not a hero.** The live monthly orbit was tried at the top of this tab once and
 * pulled back out, because a gauge there visually outranks the finding the tab exists for. So this
 * is a single row at caption weight: no big number, no arc, no accent fill, and no chevron (it
 * opens nothing, and a chevron means there is more of this to read). It carries the same three
 * parts, in the same grammar and at the same sizes, as every row below it — a moon, a line, and a
 * `phase · span` dateline — so it reads as the head of the record rather than as a second feature.
 *
 * The moon is drawn at the phase the reading will actually go out under and lit at rest: there is
 * no state below resting, so a quarter still being lived is never a dimmer moon than a finished
 * one. The app does not scold, and it does not scold in advance either.
 */
export function NextReadingCard({ due }: { due: Due }) {
  const wait = waitLabel(due.days);
  const dateline = `${due.phaseLabel} · ${spanLabel(due.span)}`;
  return (
    // One a11y element: three fragments read in turn ("moon", "next reading in 3 days", "full
    // moon, 8 to 14 …") would make a screen reader walk a card that has one thing to say.
    <Surface padded accessible accessibilityLabel={`Next reading ${wait}. ${dateline}.`}>
      <View style={styles.row}>
        <MoonPhase
          illumination={due.illumination}
          waxing={due.waxing}
          size={26}
          brightness={QUIET_MOON}
          rim
        />
        <View style={styles.text}>
          <ThemedText type="rowTitle">Next reading {wait}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {dateline}
          </ThemedText>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  // Centred on the text block, and spaced from it, exactly as `ReadingRow` does below — same moon
  // at the same size beside the same two lines, so the two must not sit differently. (The big
  // `ReadingCard` between them aligns to `flex-start` instead, because a 44pt moon beside a
  // three-line claim has a top edge to hang from and no midpoint worth finding.)
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1, gap: Spacing.half },
});
