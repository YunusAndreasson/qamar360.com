import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { MoonPhase } from '@/components/moon-phase';
import { PressableScale } from '@/components/pressable-scale';
import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { spanLabel, type Reading } from '@/lib/insights';

/** The Hijri days a reading covers — the span its evidence was measured over. */
export const readingSpanLabel = (reading: Reading): string => spanLabel(reading.span);

/** The same span with the month struck out, for a caller that has already named it — the feed's
 *  archive rows, filed under a section titled with their own Hijri month. */
export const readingDaysLabel = (reading: Reading): string => spanLabel(reading.span, { withMonth: false });

/**
 * A moon at rest. The hero's own resting level, so the two read as one object at two scales.
 *
 * Exported because the record's other moons need the same rest: {@link NextReadingCard} draws a
 * quarter that has not happened yet, and there is no state BELOW resting — a reading still being
 * lived is lit exactly like a quiet one, never dimmer.
 */
export const QUIET_MOON = 0.8;

/**
 * How brightly a reading's moon is lit — the app's two-temperature rule, applied to the record.
 *
 * `MoonPhase` already draws its lit portion in `complete`, and the hero already spends exactly
 * this signal at exactly these values (`brightness={thisRate >= 1 ? 1 : 0.8}`): quiet while a span
 * is in progress, full moonlight the instant it closes. Borrowing it here costs no new hue, no new
 * element and no legend, and it gives a year of archive rows something to scan for — the bright
 * moons are the quarters kept whole.
 *
 * It fires on `rate >= 1`, the same predicate the `record` detector calls perfect, so the picture
 * and the sentence beside it ("A whole quarter kept.") can never disagree.
 *
 * Asymmetric by construction: there is no state BELOW the resting level, so a quiet quarter's moon
 * is the same moon at the same light — never a dimmer or redder one. The app does not scold.
 */
export const readingMoonBrightness = (reading: Reading): number => (reading.quarter.rate >= 1 ? 1 : QUIET_MOON);

/**
 * One reading: the moon it went out under, the claim it leads with, and the sentence of evidence
 * beneath it. Nothing else.
 *
 * Shared by the feed's newest card and the detail screen so the thing you tapped and the thing you
 * arrive at are visibly the same object — the card simply gains company below it.
 *
 * **The claim is the card's title, and the moon it went out under is its dateline.** This card used
 * to wear a stat card's header like the cards around it — "First quarter" on the left,
 * "1–7 Rabīʿ al-Awwal" on the right — which put the moon's NAME in the card's most prominent slot,
 * at the same 18pt semibold as the claim directly beneath it. So the biggest, first thing on a
 * reading was its timestamp, said twice (the glyph beside it is that same moon), and the sentence
 * you actually came to read was the second heading down. On the detail screen it was worse still:
 * the pushed screen is already TITLED with the phase, so the card repeated the nav bar verbatim.
 *
 * A reading is an article, not a stat, and it is laid out like one now — quiet dateline, then the
 * claim, then the evidence under it. The phase and span are still on every card and still first in
 * reading order; they simply stopped outranking what they date.
 *
 * The card carries exactly one finding. Its evidence is already written as recognizable counts;
 * the detail screen adds only the direct quarter comparison rather than more competing claims.
 */
export function ReadingCard({ reading, onPress }: { reading: Reading; onPress?: () => void }) {
  const theme = useTheme();
  const body = (
    <StatCard>
      <View style={styles.claim}>
        {/* The moon dates the reading. Four a month arrive under four different shapes, which is
            what keeps a run of them from reading as four copies of one report — and it lights to
            full when the quarter it dates was kept whole. */}
        <MoonPhase
          illumination={reading.illumination}
          waxing={reading.waxing}
          size={44}
          brightness={readingMoonBrightness(reading)}
          rim
        />
        <View style={styles.claimText}>
          <View style={styles.dateline}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.datelineText}>
              {reading.phaseLabel} · {readingSpanLabel(reading)}
            </ThemedText>
            {/* Only on the feed, where this card OPENS something — and it is the same chevron, at
                the same size and tone, that every reading below it carries, under the same house
                rule: a chevron means there is more of this to read. Without it the feed's one
                large card was the only tappable thing on the screen with nothing at all to say so,
                while the small rows under it all announced themselves. */}
            {onPress ? <AppIcon name="chevronRight" size={16} color={theme.textSecondary} /> : null}
          </View>
          <ThemedText type="claim">{reading.lead.headline}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {reading.lead.body}
          </ThemedText>
        </View>
      </View>
    </StatCard>
  );

  if (!onPress) return body;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${reading.phaseLabel}, ${readingSpanLabel(reading)}. ${reading.lead.headline} ${reading.lead.body}`}
      accessibilityHint="Opens the reading in full">
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  claim: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  claimText: { flex: 1, gap: Spacing.one },
  dateline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  datelineText: { flex: 1 },
});
