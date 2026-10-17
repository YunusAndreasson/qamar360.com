import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { FormSheet } from '@/components/form-sheet';
import { MoonPhase } from '@/components/moon-phase';
import { ORBIT_SIZE, RING_STROKE } from '@/components/orbit-drawing';
import { SectionLabel } from '@/components/section-label';
import { SeparatedRows } from '@/components/separated-rows';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DATE_LOCALE, localDate } from '@/lib/dates';
import { moonAlmanac } from '@/lib/moon-almanac';
import { formatDegrees } from '@/lib/progress-format';

import type { ReactNode } from 'react';

/** The legend glyph box. */
const GLYPH = 16;
const CENTER = GLYPH / 2;

/**
 * The orbit's sheet: your figure for the month, then the moon's.
 *
 * The card is the orbit alone, so the figures are read here, on the tap. In order of weight: the
 * month and its days left are the calendar (the subtitle); your degrees are the reading (the first
 * row); the verdict is what it comes to, in the primary ink.
 *
 * Then the moon, because it is the largest thing on the card and its shape is the calendar, not your
 * progress. Saying so in a sentence explained the drawing; naming tonight's phase shows it, and
 * goes on to what someone keeping the Sunnah reads the moon for: when the White Days come, and
 * when the next month begins. Each row is what the moon does, then when, from the same Hijri
 * calendar the moon on the card is drawn from (see `moonAlmanac`).
 *
 * The note at the end is the one rule no mark can show: what a full orbit counts.
 */
export default function OrbitReadingSheet() {
  const theme = useTheme();
  // A snapshot of the card that opened this, passed as params rather than re-derived — mounting
  // the progress hook here would fire a fetch to re-answer a question already on screen.
  const { monthName, year, currentRate, usual, daysLeft, today } = useLocalSearchParams<{
    monthName: string;
    year: string;
    currentRate: string;
    /** Empty in a first month, which has no usual to be measured against. */
    usual: string;
    daysLeft: string;
    today: string;
  }>();
  const moon = today ? moonAlmanac(today) : null;
  // Only the card can open this with its snapshot. Reached any other way (a bare link), there is no
  // month to read, and a subtitle built from absent params would say "undefined".
  const router = useRouter();
  const orphaned = !monthName;
  useEffect(() => {
    if (orphaned) router.back();
  }, [orphaned, router]);
  if (orphaned) return null;

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

      {moon ? (
        <View style={styles.group}>
          <SectionLabel>The moon</SectionLabel>
          <Surface>
            <SeparatedRows>
              <LegendRow
                glyph={<MoonPhase illumination={moon.tonight.illumination} waxing={moon.tonight.waxing} size={GLYPH} rim />}
                label={moon.tonight.label}
                value="Tonight"
              />
              <LegendRow
                glyph={<MoonPhase illumination={1} waxing={false} size={GLYPH} rim />}
                label="White Days"
                value={dateSpan(moon.whiteDays.start, moon.whiteDays.end)}
              />
              <LegendRow
                glyph={<MoonPhase illumination={0} waxing size={GLYPH} rim />}
                label={moon.nextMonth.name}
                value={localDate(moon.nextMonth.start).toLocaleDateString(DATE_LOCALE, { weekday: 'short', month: 'short', day: 'numeric' })}
              />
            </SeparatedRows>
          </Surface>
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        A full orbit is 360°: every act kept from the day you added it to the end of the month. To-dos
        are counted separately.
      </ThemedText>
    </FormSheet>
  );
}

/** Two days as one span, in the app's date locale: "Oct 24–26", or "Oct 30 – Nov 1" across a month. */
function dateSpan(start: string, end: string): string {
  const month = (iso: string) => localDate(iso).toLocaleDateString(DATE_LOCALE, { month: 'short' });
  const day = (iso: string) => localDate(iso).getDate();
  return month(start) === month(end)
    ? `${month(start)} ${day(start)}–${day(end)}`
    : `${month(start)} ${day(start)} – ${month(end)} ${day(end)}`;
}

/** One row: its glyph, what it is, and its figure or its day. */
function LegendRow({ glyph, label, value }: { glyph: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${value.replace('°', ' degrees')}`}>
      <View style={styles.glyph}>{glyph}</View>
      <ThemedText type="rowTitle" numberOfLines={1} style={styles.label}>
        {label}
      </ThemedText>
      <ThemedText type="smallCompactBold" themeColor="textSecondary" style={styles.value}>
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
  // The day never gives way to the name beside it: a clipped date is no date (see the Android
  // trailing-text rule).
  value: { flexShrink: 0 },
  group: { gap: Spacing.two },
  note: { paddingHorizontal: Spacing.one },
});
