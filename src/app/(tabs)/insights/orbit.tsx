import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { FormSheet } from '@/components/form-sheet';
import { ORBIT_SIZE, RING_STROKE } from '@/components/month-summary';
import { RowSeparator } from '@/components/row-separator';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

/**
 * The legend glyph box — square, and big enough to hold the caret at its full `TICK_LENGTH`.
 *
 * Each mark is centred in it *by its own drawn extent*, not by the box's midpoint, because the two
 * have very different shapes: a bow's ink all sits above its circle's centre, so centring the
 * circle would hang the bow off the top edge (it did — the arc clipped to two dashes).
 */
const GLYPH = 16;
const CENTER = GLYPH / 2;

/** The bow's radius, and how far below the box's centre its circle sits so the drawn arc lands
 *  centred. A bow spans apex (`cy − r`) to ends (`cy − r·cos50°`), whose midpoint is ≈ `0.82r`
 *  above `cy`. */
const BOW_R = 5.5;
const BOW_SWEEP_X = BOW_R * Math.sin((50 * Math.PI) / 180);
const BOW_SWEEP_Y = BOW_R * Math.cos((50 * Math.PI) / 180);
const BOW_CY = CENTER + BOW_R * 0.82;

/**
 * What the orbit means — the hero's own key, on the sheet it opens.
 *
 * The ring above is a progress bar bent into a circle with a target mark on it, and the two figures
 * here are the two things drawn on it, named once. They used to sit under the orbit as quiet legend
 * rows; they read as a footnote to a 232pt instrument rather than as its key, and they crowded the
 * one datum the hero is supposed to hold.
 *
 * There were three rows. The third named a caret at your average position, and it went when the
 * caret did: how you are doing against your usual is now a sentence on the card itself, and a
 * sentence is its own legend. This sheet explains marks — nothing more belongs in it.
 *
 * The closing line is the reason this sheet exists at all. The moon is the largest, brightest
 * thing on the screen and its SHAPE is the calendar — tonight's real phase for today's Hijri date,
 * computed from the date alone and nothing else. Anyone will read a half-lit moon as "I am halfway
 * through what I set out to do", which is a different claim entirely, and no amount of ring design
 * corrects a misreading of the object in the middle of it. So it is said, plainly, in words.
 *
 * A `fitToContents` sheet cannot scroll, so this must stay short enough to never need to. Three
 * rows and a sentence is the ceiling; if it ever grows past that it becomes a pushed screen like
 * the stacking and exchange guides.
 */
export default function OrbitReadingSheet() {
  const theme = useTheme();
  // A snapshot of the card that opened this, passed as params rather than re-derived — mounting
  // the progress hook here would fire a fetch to re-answer a question already on screen.
  const { monthName, year, current, pace } = useLocalSearchParams<{
    monthName: string;
    year: string;
    current: string;
    pace: string;
  }>();

  return (
    <FormSheet title="Reading the orbit" subtitle={`${monthName} ${year} H`}>
      <Surface>
        {/* Ordered as the ring is read: you first, because that is the bright arc and the number
            above it; then the mark you are chasing. */}
        <LegendRow glyph={<Dot color={theme.accent} />} label="You, this month" value={`${current}°`} />
        <RowSeparator />
        {/* "The month so far", not "on pace": the number is where the month itself has got to, and
            catching it means the two arc heads meet. True on a first day, when there is no past
            self to race. */}
        <LegendRow glyph={<ArcSwatch color={theme.orbitPace} />} label="The month so far" value={`${pace}°`} />
      </Surface>

      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        A full orbit is 360° — the whole month kept. The moon inside it shows tonight’s real phase
        for the date, not your progress.
      </ThemedText>
    </FormSheet>
  );
}

/** One mark from the ring, what it is, and its figure. */
function LegendRow({ glyph, label, value }: { glyph: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${value.replace('°', ' degrees')}`}>
      <View style={styles.glyph}>{glyph}</View>
      <ThemedText type="rowTitle" style={styles.label} numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="smallCompactBold" themeColor="textSecondary">
        {value}
      </ThemedText>
    </View>
  );
}

/**
 * The bright arc's head — a round cap on its own, which is exactly what the orbit's live arc ends
 * in. Deliberately a different SHAPE from the bow beside it rather than a brighter bow: three
 * marks distinguished only by tone is the thing the ring itself was just cured of.
 */
function Dot({ color }: { color: string }) {
  // Sized against the bow beside it, not against the ring's stroke. Literally a round cap on a
  // 3.5pt stroke, the dot would be 3.5pt across and read as a full stop next to a mark spanning
  // eleven — geometrically faithful and visually invisible. The pair has to weigh the same.
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox={`0 0 ${GLYPH} ${GLYPH}`}>
      <Circle cx={CENTER} cy={CENTER} r={ringStroke()} fill={color} />
    </Svg>
  );
}

/**
 * A short segment of the ring itself, in the tone the elapsed stretch is drawn in — so the glyph
 * reads as "that band up there" rather than as a new mark. It bows because the thing it names is
 * curved; a straight dash would read as a rule or a divider.
 */
function ArcSwatch({ color }: { color: string }) {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox={`0 0 ${GLYPH} ${GLYPH}`}>
      <Path
        d={`M ${CENTER - BOW_SWEEP_X} ${BOW_CY - BOW_SWEEP_Y} A ${BOW_R} ${BOW_R} 0 0 1 ${CENTER + BOW_SWEEP_X} ${BOW_CY - BOW_SWEEP_Y}`}
        stroke={color}
        strokeWidth={ringStroke()}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * The ring's stroke at glyph scale. The orbit is 232pt wide with a 12pt stroke; holding that ratio
 * literally would give a 0.8pt hairline here, which is a proportion rather than a mark — so it is
 * scaled up to the point where a 16pt glyph reads as the same object, and both the bow's weight and
 * the dot's diameter come off this one number so they stay siblings.
 */
function ringStroke(): number {
  return GLYPH * (RING_STROKE / ORBIT_SIZE) * 4.2;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48, // Android's Material minimum (also clears iOS's 44pt), matching SheetRow
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  glyph: { width: GLYPH, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
  note: { paddingHorizontal: Spacing.one },
});
