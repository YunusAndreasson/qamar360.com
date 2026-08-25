import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { MoonPhase } from '@/components/moon-phase';
import { PressableScale } from '@/components/pressable-scale';
import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { spanLabel, type Reading } from '@/lib/insights';
import { toDegrees } from '@/lib/progress';

import type { ReactNode } from 'react';

/** The Hijri days a reading covers — the span its figures are measured over, which is what makes
 *  a degrees figure mean anything here (360° is a perfect week, not a perfect month). */
export const readingSpanLabel = (reading: Reading): string => spanLabel(reading.span);

/**
 * The quarter-on-quarter pair, in the app's own unit.
 *
 * On every reading, whatever led it. The headline rotates so four readings a month don't say one
 * thing over and over — but "did I do better than the last quarter" is the question the whole
 * feature was asked for, so its answer is never the thing that rotates away.
 *
 * Both figures are captioned with the span they measure, because 360° means a perfect *quarter*
 * here and a perfect *month* on the orbit above it, and nothing else on the card would say which.
 *
 * **These are evidence, not the card's datum, and they are now sized like it.** They used to be set
 * in `subtitle` — 32pt, nearly twice the headline above them — so the largest thing on a card whose
 * whole point is a written claim was a pair of raw figures under it, and the eye landed on the
 * arithmetic rather than on the sentence that had already done it for you. On the Insights feed
 * that also put a 32pt "0°" four hundred pixels under the hero's 46pt "0°", two numbers measured
 * against different denominators dressed almost alike.
 */
function PaceReading({ reading }: { reading: Reading }) {
  const theme = useTheme();
  const here = toDegrees(reading.quarter.rate);
  const there = reading.previous ? toDegrees(reading.previous.rate) : null;
  return (
    <View
      style={styles.pace}
      accessibilityRole="text"
      accessibilityLabel={
        there === null
          ? `This quarter, ${here} degrees. There is no earlier quarter to compare it with.`
          : `This quarter, ${here} degrees. Last quarter, ${there} degrees.`
      }>
      {/* Warm the instant the quarter was kept in full — the app's one colour rule for "done",
          borrowed exactly as the orbit uses it (cool steel while a span is in progress, warm
          moonlight when it closes). There is deliberately no colour for the other direction: a
          figure that turned red at a quiet quarter would be the scold this app has a rule
          against, and the copy already says what happened, gently. */}
      <Figure value={`${here}°`} label="this quarter" tone={reading.quarter.rate >= 1 ? theme.complete : undefined} />
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Figure value={there === null ? '—' : `${there}°`} label={there === null ? 'no quarter before' : 'last quarter'} muted />
    </View>
  );
}

function Figure({ value, label, muted = false, tone }: { value: string; label: string; muted?: boolean; tone?: string }) {
  return (
    <View style={styles.figure}>
      <ThemedText type="heading" themeColor={muted ? 'textSecondary' : 'text'} style={tone ? { color: tone } : undefined}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/**
 * One reading, in full: the moon it went out under, the claim it leads with, the evidence, and
 * the pair of figures behind both.
 *
 * Shared by the feed's newest card and the detail screen so the thing you tapped and the thing
 * you arrive at are visibly the same object — the card simply gains company below it.
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
 */
export function ReadingCard({ reading, onPress, children }: { reading: Reading; onPress?: () => void; children?: ReactNode }) {
  const theme = useTheme();
  const body = (
    <StatCard>
      <View style={styles.claim}>
        {/* The moon dates the reading. Four a month arrive under four different shapes, which is
            what keeps a run of them from reading as four copies of one report. */}
        <MoonPhase illumination={reading.illumination} waxing={reading.waxing} size={44} rim />
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
          <ThemedText type="heading">{reading.lead.headline}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {reading.lead.body}
          </ThemedText>
        </View>
      </View>
      <PaceReading reading={reading} />
      {children}
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
  pace: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  figure: { gap: Spacing.half },
  // A hairline between the two figures, so they read as one comparison rather than two readouts.
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
