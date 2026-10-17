import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { FormSheet } from '@/components/form-sheet';
import { ORBIT_SIZE, RING_STROKE } from '@/components/orbit-drawing';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDegrees } from '@/lib/progress-format';

import type { ReactNode } from 'react';

/** The legend glyph box. */
const GLYPH = 16;
const CENTER = GLYPH / 2;

/**
 * What the Progress orbit means — the hero's own key, on the sheet it opens.
 *
 * The ring above is one stripe on a groove, and the row here is that stripe, named once with its
 * figure. Legend rows used to sit under the orbit; they read as a footnote to a 232pt instrument
 * rather than as its key, and they crowded the one datum the hero is supposed to hold.
 *
 * There were three rows. One named a caret at your average position and went when the caret did:
 * how you are doing against your usual is a sentence, and a sentence is its own legend. Another
 * named the brighter band for the month elapsed, and went with that band.
 *
 * It is also where the figures live now. The card is the orbit alone, so the degrees, your usual
 * and the days left are read here, on the tap, beside the marks they are read off. In order of
 * weight: the month and its days left are the calendar (the subtitle); the figure is the reading
 * (the row); the verdict is what it comes to, in the primary ink; the note is reference, and
 * quietest.
 *
 * The closing line is the reason this sheet exists at all. The moon is the largest, brightest
 * thing on the screen and its SHAPE is the calendar — tonight's real phase for today's Hijri date,
 * computed from the date alone and nothing else. Anyone will read a half-lit moon as "I am halfway
 * through what I set out to do", which is a different claim entirely, and no amount of ring design
 * corrects a misreading of the object in the middle of it. So it is said, plainly, in words.
 *
 * A `fitToContents` sheet cannot scroll, so this must stay short enough to never need to. Three
 * rows and two sentences is the ceiling; if it ever grows past that it becomes a pushed screen like
 * the stacking and exchange guides.
 */
export default function OrbitReadingSheet() {
  const theme = useTheme();
  // A snapshot of the card that opened this, passed as params rather than re-derived — mounting
  // the progress hook here would fire a fetch to re-answer a question already on screen.
  const { monthName, year, currentRate, usual, daysLeft } = useLocalSearchParams<{
    monthName: string;
    year: string;
    currentRate: string;
    /** Empty in a first month, which has no usual to be measured against. */
    usual: string;
    daysLeft: string;
  }>();

  return (
    <FormSheet title="Reading the orbit" subtitle={`${monthName} ${year} H · ${daysLeft}`}>
      <Surface>
        <LegendRow glyph={<Dot color={theme.accent} />} label="You, this month" value={formatDegrees(Number(currentRate))} />
      </Surface>

      {usual ? (
        <ThemedText type="default" style={styles.note}>
          {usual}
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        A full orbit is 360°: every act kept from the day you added it to the end of the month. The
        moon inside it shows tonight’s real phase for the date, not your progress. To-dos and goal
        check-ins are counted separately.
      </ThemedText>
    </FormSheet>
  );
}

/** One mark from the ring, what it is, and its figure. */
function LegendRow({ glyph, label, value }: { glyph: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${value.replace('°', ' degrees')}`}>
      <View style={styles.glyph}>{glyph}</View>
      <ThemedText type="rowTitle" style={styles.label}>
        {label}
      </ThemedText>
      <ThemedText type="smallCompactBold" themeColor="textSecondary">
        {value}
      </ThemedText>
    </View>
  );
}

/** The stripe's head: a round cap on its own, which is exactly what the orbit's live arc ends in. */
function Dot({ color }: { color: string }) {
  return (
    <Svg width={GLYPH} height={GLYPH} viewBox={`0 0 ${GLYPH} ${GLYPH}`}>
      <Circle cx={CENTER} cy={CENTER} r={ringStroke()} fill={color} />
    </Svg>
  );
}

/**
 * The ring's stroke at glyph scale. Holding the orbit's ratio literally would give a hairline here,
 * which is a proportion rather than a mark, so it is scaled up until a 16pt glyph reads as the same
 * object.
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
