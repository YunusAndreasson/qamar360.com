import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ProgressCircle } from '@/components/progress-circle';
import { ThemedText } from '@/components/themed-text';
import { DenseLabelScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** One cell in a moon strip — sized once here so the Today week strip and the Progress
 *  year strip stay visually identical (same disc, stroke, label rhythm). */
export const CELL_SIZE = 48;
const MOON_SIZE = 34;
const RING_STROKE = 3;

type Props = {
  /** Caption under the disc (a weekday abbreviation or a month number). */
  label: string | number;
  /** Completion 0–1, carried by the ring arc. */
  fraction: number;
  /** The "you are here" cell (today / current month): accent ring + accent bold label. */
  active?: boolean;
  /** Not yet reached (a future month): a fainter "new moon". */
  muted?: boolean;
  /** Sizing supplied by the parent grid (e.g. `flex: 1` or a fixed column width). */
  style?: StyleProp<ViewStyle>;
};

/**
 * A labelled completion disc — the shared unit of both moon strips. Presentation only;
 * the parent owns the grid layout and the data.
 */
export function ProgressCell({ label, fraction, active = false, muted = false, style }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.cell, style]}>
      <ProgressCircle fraction={fraction} size={MOON_SIZE} strokeWidth={RING_STROKE} active={active} muted={muted} />
      <ThemedText
        type={active ? 'smallCompactBold' : 'smallCompact'}
        numberOfLines={1}
        maxFontSizeMultiplier={DenseLabelScale}
        style={[styles.label, { color: active ? theme.accent : theme.textSecondary }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { height: CELL_SIZE, alignItems: 'center', justifyContent: 'space-between' },
  label: { textAlign: 'center' },
});
