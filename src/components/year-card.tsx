import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ORBIT_GLYPH, ORBIT_GLYPH_STROKE, ORBIT_GLYPH_TEXT_SCALE, OrbitMark } from '@/components/orbit-mark';
import { StatCard, StatCardHeader } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { Duration, Spring } from '@/constants/motion';
import { Disabled, FontWeight, Pressed, Spacing } from '@/constants/theme';
import type { RecordSeries } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { hijriParts } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { yearMonths, type YearMonth } from '@/lib/progress';
import { formatDegrees } from '@/lib/progress-format';

/** Six months to a row: Muḥarram to Jumādā al-Thānī, then Rajab to Dhū al-Ḥijjah. */
const PER_ROW = 6;
/** Above and below a month's orbit, inside its cell: the week bar's day padding. */
const CELL_PAD = Spacing.one + Spacing.half;
const CELL_HEIGHT = ORBIT_GLYPH + CELL_PAD * 2;
const ROW_GAP = Spacing.one;
/** The light inside a picked month's orbit: the ring's interior, standing a hair in from the stroke. */
const DISC = ORBIT_GLYPH - ORBIT_GLYPH_STROKE * 2 - Spacing.half;
/** How strongly it is lit, in the month's own colour; a month with no colour of its own gets less. */
const DISC_TINT = 0.16;
const DISC_TINT_NEUTRAL = 0.08;
/** Where a picked month's light grows from. */
const DISC_FROM = 0.6;
/** Ramaḍān's place in the year, 0-based. */
const RAMADAN = 8;

/**
 * The year as its twelve moons: each Hijri month an orbit, filled as far as it was kept.
 *
 * The same mark as a day in Today's week bar, at the same size, so the app draws a span of time one
 * way at every scale: a day is an orbit, the month is the orbit round the moon above, and the year
 * is twelve of them. A month kept in full is closed and warm. The month you are in is the moon's
 * own stripe, and fills on the same sweep (`stripe`). A month that asked nothing is drawn as
 * nothing, and the months still to come as empty grooves, as the week bar draws the days ahead.
 *
 * Inside each orbit is the month's number, in the quiet ink; this month's in the accent, the way
 * the week bar marks today; Ramaḍān's in the primary ink and heavier, as Jumuʿah stands out in the
 * week. Nothing else is printed at rest.
 *
 * Tap any month and the header's caption names it, with its figure where it has one ("Ṣafar ·
 * 360°"; a month still to come is its name alone), while its orbit lights from inside in its own
 * colour: warm for a month kept in full, the accent for one under way, faint white for one with
 * neither. A light rather than a tile, because every mark on this card is round. A month kept in
 * full is felt as one (the kept month's beat). Tap it again and the card is back to naming the year.
 */
export function YearCard({ series, stripe }: { series: RecordSeries; stripe: SharedValue<number> }) {
  const months = yearMonths(series);
  const first = series.points[0];
  const year = first ? (hijriParts(first.iso)?.year ?? null) : null;

  const [picked, setPicked] = useState<number | null>(null);
  // A refetch can shorten the year under a pick (a new year began), so it is read through the list.
  const selected = picked !== null && months[picked] ? picked : null;
  const reading = selected !== null ? months[selected]! : null;

  const pick = (index: number) => {
    if (index === selected) {
      haptics.selection();
      setPicked(null);
      return;
    }
    if (months[index]!.kept) haptics.keptMonth();
    else haptics.selection();
    setPicked(index);
  };

  const rows = [months.slice(0, PER_ROW), months.slice(PER_ROW)];

  return (
    <StatCard>
      <StatCardHeader
        title="Year"
        trailing={
          reading ? (
            <View style={styles.caption}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.captionLabel}>
                {reading.name}
              </ThemedText>
              {reading.rate !== null ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {' · '}
                  <ThemedText type="smallBold" style={styles.captionValue}>
                    {formatDegrees(reading.rate)}
                  </ThemedText>
                </ThemedText>
              ) : null}
            </View>
          ) : year ? (
            `${year} H`
          ) : null
        }
      />
      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((month, c) => {
              const index = r * PER_ROW + c;
              return (
                <MonthCell
                  key={month.name}
                  month={month}
                  index={index}
                  year={year}
                  selected={index === selected}
                  stripe={stripe}
                  onPick={pick}
                />
              );
            })}
          </View>
        ))}
      </View>
    </StatCard>
  );
}

function MonthCell({
  month,
  index,
  year,
  selected,
  stripe,
  onPick,
}: {
  month: YearMonth;
  index: number;
  year: number | null;
  selected: boolean;
  stripe: SharedValue<number>;
  onPick: (index: number) => void;
}) {
  const theme = useTheme();
  const running = month.phase === 'running';
  const ramadan = index === RAMADAN;
  // A month that asked nothing, or has not come yet, rests dimmed, as the days ahead do in the week
  // bar; picked, it comes up to full so the name in the caption has a month to belong to.
  const quiet = month.rate === null;
  const light = month.kept ? theme.complete : quiet ? theme.text : theme.accent;
  return (
    <Pressable
      onPress={() => onPick(index)}
      accessibilityRole="button"
      accessibilityLabel={monthAccessibilityLabel(month, year)}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed, quiet && !selected && styles.dim]}>
      <View style={styles.orbit}>
        <MonthLight on={selected} color={light} tint={quiet ? DISC_TINT_NEUTRAL : DISC_TINT} />
        <View style={StyleSheet.absoluteFill}>
          <OrbitMark
            rate={month.rate}
            size={ORBIT_GLYPH}
            strokeWidth={ORBIT_GLYPH_STROKE}
            groove={month.phase !== 'quiet'}
            kept={month.kept}
            follow={running ? stripe : undefined}
          />
        </View>
        <ThemedText
          type={selected ? 'smallCompactBold' : 'smallCompact'}
          themeColor={running ? 'accent' : ramadan || selected ? 'text' : 'textSecondary'}
          maxFontSizeMultiplier={ORBIT_GLYPH_TEXT_SCALE}
          style={ramadan && !selected && styles.strong}>
          {index + 1}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/**
 * A picked month's orbit, lit from inside: a disc of its own colour, faint, that grows into the
 * ring on the settle spring and fades out when the month is let go. Without motion under Reduce
 * Motion.
 */
function MonthLight({ on, color, tint }: { on: boolean; color: string; tint: number }) {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    shown.set(reduceMotion ? (on ? 1 : 0) : on ? withSpring(1, Spring.settle) : withTiming(0, { duration: Duration.fast }));
  }, [on, reduceMotion, shown]);
  const lit = useAnimatedStyle(() => {
    const s = shown.get();
    return { opacity: Math.min(1, Math.max(0, s)) * tint, transform: [{ scale: DISC_FROM + (1 - DISC_FROM) * s }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.disc, { backgroundColor: color }, lit]} />;
}

/** Which month, of which year, and how much of it was kept: in the order a sighted reader reads. */
function monthAccessibilityLabel(month: YearMonth, year: number | null): string {
  const name = year ? `${month.name} ${year}` : month.name;
  if (month.phase === 'ahead') return `${name}, still to come`;
  if (month.phase === 'quiet' || month.rate === null) return `${name}, nothing due`;
  const kept = month.kept ? 'kept in full' : `${formatDegrees(month.rate)} kept`;
  return month.phase === 'running' ? `${name}, this month, ${kept}` : `${name}, ${kept}`;
}

const styles = StyleSheet.create({
  // The reading, as the Lifetime card's scrub shows its own: the name gives way before the figure.
  caption: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  captionLabel: { flexShrink: 1 },
  // Tabular, so the name beside it does not shuffle sideways from one month's figure to the next.
  captionValue: { fontVariant: ['tabular-nums'] },
  grid: { gap: ROW_GAP },
  row: { flexDirection: 'row' },
  cell: { flex: 1, height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  orbit: { width: ORBIT_GLYPH, height: ORBIT_GLYPH, alignItems: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', width: DISC, height: DISC, borderRadius: DISC / 2 },
  strong: { fontWeight: FontWeight.semibold },
  pressed: { opacity: Pressed.dim },
  dim: { opacity: Disabled },
});
