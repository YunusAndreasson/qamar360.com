import { StyleSheet, View } from 'react-native';

import { MoonPhase } from '@/components/moon-phase';
import { PressableScale } from '@/components/pressable-scale';
import { StatCard, StatCardHeader } from '@/components/stat-card';
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
      <Figure value={`${here}°`} label="this quarter" />
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Figure value={there === null ? '—' : `${there}°`} label={there === null ? 'no quarter before' : 'last quarter'} muted />
    </View>
  );
}

function Figure({ value, label, muted = false }: { value: string; label: string; muted?: boolean }) {
  return (
    <View style={styles.figure}>
      <ThemedText type="subtitle" themeColor={muted ? 'textSecondary' : 'text'}>
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
 */
export function ReadingCard({ reading, onPress, children }: { reading: Reading; onPress?: () => void; children?: ReactNode }) {
  const body = (
    <StatCard>
      <StatCardHeader title={reading.phaseLabel} trailing={readingSpanLabel(reading)} />
      <View style={styles.claim}>
        {/* The moon dates the reading. Four a month arrive under four different shapes, which is
            what keeps a run of them from reading as four copies of one report. */}
        <MoonPhase illumination={reading.illumination} waxing={reading.waxing} size={44} />
        <View style={styles.claimText}>
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
  pace: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  figure: { gap: Spacing.half },
  // A hairline between the two figures, so they read as one comparison rather than two readouts.
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
