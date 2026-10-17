import { useEffect, useRef, useState } from 'react';
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
import { Disabled, FontWeight, Pressed, Radius, Spacing } from '@/constants/theme';
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
/** How far the selection tile stands in from its column's edges, as in the week bar. */
const TILE_INSET = Spacing.half;
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
 * week. Nothing else is printed at rest. Tap a month and the header's caption becomes its reading
 * ("Ṣafar · 360°") while a tile slides under it; a month kept in full is felt as one (the kept
 * month's beat). Tap it again and the card is back to naming the year.
 */
export function YearCard({ series, stripe }: { series: RecordSeries; stripe: SharedValue<number> }) {
  const months = yearMonths(series);
  const first = series.points[0];
  const year = first ? (hijriParts(first.iso)?.year ?? null) : null;

  const [picked, setPicked] = useState<number | null>(null);
  // Only a month with a figure can be read; a refetch that leaves the pick on one without (a new
  // year began under it) reads as nothing picked.
  const selected = picked !== null && readable(months[picked]) ? picked : null;
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

  const [width, setWidth] = useState(0);
  const column = width / PER_ROW;
  const rows = [months.slice(0, PER_ROW), months.slice(PER_ROW)];

  return (
    <StatCard>
      <StatCardHeader
        title="Year"
        trailing={
          reading && reading.rate !== null ? (
            <View style={styles.caption}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.captionLabel}>
                {reading.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {' · '}
                <ThemedText type="smallBold" style={styles.captionValue}>
                  {formatDegrees(reading.rate)}
                </ThemedText>
              </ThemedText>
            </View>
          ) : year ? (
            `${year} H`
          ) : null
        }
      />
      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? <SelectionTile index={selected} column={column} /> : null}
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

function readable(month: YearMonth | undefined): boolean {
  return month?.phase === 'running' || month?.phase === 'closed';
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
  const enabled = readable(month);
  const running = month.phase === 'running';
  const ramadan = index === RAMADAN;
  return (
    <Pressable
      onPress={() => onPick(index)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={monthAccessibilityLabel(month, year)}
      accessibilityState={{ selected, disabled: !enabled }}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed, !enabled && styles.disabled]}>
      <View style={styles.orbit}>
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
          themeColor={running ? 'accent' : ramadan ? 'text' : 'textSecondary'}
          maxFontSizeMultiplier={ORBIT_GLYPH_TEXT_SCALE}
          style={ramadan && !selected && styles.strong}>
          {index + 1}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** Which month, of which year, and how much of it was kept: in the order a sighted reader reads. */
function monthAccessibilityLabel(month: YearMonth, year: number | null): string {
  const name = year ? `${month.name} ${year}` : month.name;
  if (month.phase === 'ahead') return `${name}, still to come`;
  if (month.phase === 'quiet' || month.rate === null) return `${name}, nothing due`;
  const kept = month.kept ? 'kept in full' : `${formatDegrees(month.rate)} kept`;
  return month.phase === 'running' ? `${name}, this month, ${kept}` : `${name}, ${kept}`;
}

/**
 * The month being read: a tile under its cell, as the day you are on stands on one in the week
 * bar. From one month to another it slides on the same spring; from rest it fades in where it is
 * needed rather than flying in from a corner, and fades out when the card goes back to rest.
 * Without motion under Reduce Motion.
 */
function SelectionTile({ index, column }: { index: number | null; column: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  const shown = useRef(false);

  useEffect(() => {
    if (index === null) {
      shown.current = false;
      opacity.set(reduceMotion ? 0 : withTiming(0, { duration: Duration.fast }));
      return;
    }
    const tx = (index % PER_ROW) * column + TILE_INSET;
    const ty = Math.floor(index / PER_ROW) * (CELL_HEIGHT + ROW_GAP);
    if (!shown.current || reduceMotion) {
      x.set(tx);
      y.set(ty);
      opacity.set(reduceMotion ? 1 : withTiming(1, { duration: Duration.fast }));
    } else {
      x.set(withSpring(tx, Spring.settle));
      y.set(withSpring(ty, Spring.settle));
    }
    shown.current = true;
  }, [index, column, reduceMotion, x, y, opacity]);

  const place = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tile,
        {
          width: column - TILE_INSET * 2,
          backgroundColor: theme.backgroundSelected,
          borderColor: theme.border,
          borderTopColor: theme.topHighlight,
        },
        place,
      ]}
    />
  );
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
  strong: { fontWeight: FontWeight.semibold },
  tile: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: CELL_HEIGHT,
    borderRadius: Radius.button,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: Pressed.dim },
  disabled: { opacity: Disabled },
});
