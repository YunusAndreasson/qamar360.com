import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ProgressCircle } from '@/components/progress-circle';
import { ThemedText } from '@/components/themed-text';
import { DenseLabelScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Disc diameter when the caller doesn't override it. */
const DEFAULT_MOON_SIZE = 42;
const RING_STROKE = 3;
/** Headroom under the disc for the caption, so cells share one baseline rhythm. */
const LABEL_BAND = 16;

type Props = {
  /** Caption under the disc (a weekday abbreviation or a day/month number). */
  label: string | number;
  /** Completion 0–1, carried by the ring arc. */
  fraction: number;
  /** The "you are here" cell (today / current month): accent ring + accent bold label. */
  active?: boolean;
  /** Not yet reached (a future day/month): a fainter, dimmed moon. */
  muted?: boolean;
  /**
   * A White Day (Ayyām al-Bīḍ, the 13th–15th) — the nights the moon is full and the Sunnah fast
   * falls. Marked by lighting the day-number in moonlight silver, so the grid's fullest moons and
   * the recommended fast read as one. Purely a calendar marker — never tied to completion.
   */
  whiteDay?: boolean;
  /** When set, the disc shows the true moon at this phase instead of a flat fill. */
  phase?: { illumination: number; waxing: boolean };
  /** Disc diameter; defaults to {@link DEFAULT_MOON_SIZE}. */
  size?: number;
  /** Sizing supplied by the parent grid (e.g. a fixed column width). */
  style?: StyleProp<ViewStyle>;
};

/**
 * A labelled completion disc — the shared unit of the Progress moon grid. Presentation only;
 * the parent owns the grid layout and the data. With `phase` the interior is the true lunar
 * phase of that day; the ring around it always carries completion.
 */
export function ProgressCell({
  label,
  fraction,
  active = false,
  muted = false,
  whiteDay = false,
  phase,
  size = DEFAULT_MOON_SIZE,
  style,
}: Props) {
  const theme = useTheme();
  // Today wins (you-are-here accent); then a White Day glows in moonlight; otherwise muted/normal.
  const labelColor = active
    ? theme.accent
    : muted
      ? theme.textDisabled
      : whiteDay
        ? theme.complete
        : theme.textSecondary;
  return (
    <View style={[styles.cell, { height: size + LABEL_BAND }, style]}>
      <ProgressCircle fraction={fraction} size={size} strokeWidth={RING_STROKE} active={active} muted={muted} phase={phase} />
      <ThemedText
        type={active || whiteDay ? 'smallCompactBold' : 'smallCompact'}
        numberOfLines={1}
        maxFontSizeMultiplier={DenseLabelScale}
        style={[styles.label, { color: labelColor }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { alignItems: 'center', justifyContent: 'space-between' },
  label: { textAlign: 'center' },
});
