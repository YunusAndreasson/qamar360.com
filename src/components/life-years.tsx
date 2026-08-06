import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { StatCard, StatCardHeader } from '@/components/stat-card';
import { StatReadout } from '@/components/stat-readout';
import { ThemedText } from '@/components/themed-text';
import { DenseLabelScale, Spacing } from '@/constants/theme';
import type { LifeProgress, LifeYear } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { ringMetrics, toDegrees } from '@/lib/progress';

/** The ring for one year. Large enough to read a thin arc at a glance, small enough that a decade
 *  still fits the row without scrolling. */
const RING = 44;
const RING_STROKE = 3;

/** One year as a line: "1447 · 214°", the year now running tagged the way the month grid tags
 *  today. */
function yearReadout(y: LifeYear): string {
  const value = `${toDegrees(y.fraction)}°`;
  return y.state === 'current' ? `${y.year} · ${value} · this year` : `${y.year} · ${value}`;
}

/** The same reading spoken, degrees spelled out. */
function yearA11yLabel(y: LifeYear): string {
  const value = `${toDegrees(y.fraction)} degrees complete`;
  return y.state === 'current' ? `${y.year} H, ${value}, this year` : `${y.year} H, ${value}`;
}

/**
 * "This life": every Hijri year on record, one ring each — the long view, and the last zoom-out
 * the app has. The hero measures a month, "This year" measures the months of one year, and this
 * measures the years themselves.
 *
 * A year is drawn as an orbit rather than a bar because that is what a year *is* here: the same
 * ring the month hero fills, at the scale where one turn is twelve months of keeping. The year now
 * running is measured like the current month on the year strip — done so far over the whole year's
 * possible — so it fills gradually rather than snapping full in Muḥarram, and it wears the accent
 * while closed years rest in the completion tone.
 *
 * Tap a year to read its figure; at rest the readout says where the record opens, which is the one
 * fact a lifetime view owes you that no ring can show. Renders nothing until there is a record —
 * a single empty ring would be a worse answer than silence.
 */
export function LifeYears({ life }: { life: LifeProgress | null }) {
  const theme = useTheme();
  // Which year the header reads — null is the resting state ("Since …"). Keyed by year number so
  // it survives a refresh's new objects.
  const [focusedYear, setFocusedYear] = useState<number | null>(null);

  if (!life || life.years.length === 0) return null;

  const focused = focusedYear != null ? (life.years.find((y) => y.year === focusedYear) ?? null) : null;
  const readoutText = focused ? yearReadout(focused) : `Since ${life.sinceMonthName} ${life.sinceYear}`;

  const span =
    life.years.length === 1
      ? `${life.years[0]!.year} H`
      : `${life.years[0]!.year}–${life.years[life.years.length - 1]!.year} H`;

  return (
    <StatCard>
      <View style={styles.head}>
        <StatCardHeader title="This life" trailing={span} />
        <StatReadout text={readoutText} refreshKey={focusedYear ?? 'resting'} />
      </View>

      {/* Oldest first, so the row reads forward like a life does. Wrapping rather than scrolling:
          a decade fits three to a line on the narrowest phone, and a horizontal scroller would
          hide years behind a gesture — the one thing this card exists to show all of. */}
      <View style={styles.years}>
        {life.years.map((y) => {
          const isCurrent = y.state === 'current';
          return (
            <Pressable
              key={y.year}
              onPress={() => {
                haptics.selection();
                setFocusedYear(y.year);
              }}
              accessibilityRole="button"
              accessibilityLabel={yearA11yLabel(y)}
              style={styles.year}>
              <YearRing fraction={y.fraction} color={isCurrent ? theme.accent : theme.complete} />
              <ThemedText
                type={isCurrent ? 'smallCompactBold' : 'smallCompact'}
                maxFontSizeMultiplier={DenseLabelScale}
                style={{ color: isCurrent ? theme.accent : theme.textSecondary }}>
                {y.year}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </StatCard>
  );
}

/**
 * One year's orbit: a quiet track with the year's completion swept onto it. Hollow — not the month
 * grid's disc-in-a-ring, whose interior is a *moon* and so belongs to a day. A year has no phase to
 * show, and a filled disc at this size would read as one, so the ring is left open.
 */
function YearRing({ fraction, color }: { fraction: number; color: string }) {
  const theme = useTheme();
  const { radius, ringRadius, circumference, arc } = ringMetrics(RING, RING_STROKE, fraction);
  return (
    <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
      <Circle cx={radius} cy={radius} r={ringRadius} stroke={theme.accentTrack} strokeWidth={RING_STROKE} fill="none" />
      {arc > 0 ? (
        <Circle
          cx={radius}
          cy={radius}
          r={ringRadius}
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          fill="none"
          // 12 o'clock, clockwise — the direction every orbit in the app sweeps.
          transform={`rotate(-90 ${radius} ${radius})`}
        />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.two },
  // 24 between years so the rings never crowd; the row wraps once a life outgrows one line.
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four, alignItems: 'flex-start' },
  year: { alignItems: 'center', gap: Spacing.one },
});
