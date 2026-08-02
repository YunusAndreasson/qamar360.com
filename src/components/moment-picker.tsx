import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { FieldLabel } from '@/components/field-label';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { DenseLabelScale, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MOMENT_GROUPS, MOMENTS, type MomentKey } from '@/lib/moments';

/**
 * The stack editors' moment picker: a uniform grid of icon-over-label cells, one labeled
 * group per row-block (sky, life moments, prayers), so all the choices are visible and
 * column-aligned at once — what you choose IS the emblem the stack's header wears on Today.
 * Always optional: a single selection across all groups; tap the selected cell again to
 * clear (no "None" cell to weigh the grid down).
 */
export function MomentPicker({
  value,
  onChange,
}: {
  value: MomentKey | null;
  onChange: (value: MomentKey | null) => void;
}) {
  const theme = useTheme();
  return (
    <>
      {MOMENT_GROUPS.map((group) => (
        <View key={group.key}>
          <FieldLabel style={styles.label}>{group.title}</FieldLabel>
          <View style={styles.grid}>
            {group.moments.map((key) => {
              const selected = value === key;
              const tint = selected ? theme.accent : theme.textSecondary;
              return (
                <PressableScale
                  key={key}
                  onPress={() => onChange(selected ? null : key)}
                  android_ripple={{ color: theme.backgroundSelected }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Anchor to ${MOMENTS[key].label}`}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: selected ? theme.accentSubtle : theme.backgroundElement,
                      borderColor: selected ? theme.accent : theme.border,
                    },
                  ]}>
                  <AppIcon name={MOMENTS[key].icon} size={22} color={tint} />
                  {/* Two lines, not one: every cell names a completed deed ("Prayed Maghrib",
                      "Woke in the night") and a name that says what it means is worth more than
                      one that fits a box — truncating these back to "Prayed Mag…" would undo
                      exactly what the label is for. */}
                  <ThemedText
                    type="smallCompact"
                    numberOfLines={2}
                    maxFontSizeMultiplier={DenseLabelScale}
                    style={[styles.cellLabel, { color: tint }]}>
                    {MOMENTS[key].label}
                  </ThemedText>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        Pick one, or none — the stack wears its icon and lights up when the moment arrives. A time
        can’t remind you of anything: anchor to something you already do, and the acts come with it.
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: Spacing.four },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  // Four uniform columns: fixed basis + a capped grow, so a short last row (3 life moments,
  // 2 trailing prayers) keeps the same cell width as a full one instead of stretching ragged.
  cell: {
    flexBasis: '22%',
    flexGrow: 1,
    maxWidth: '23.5%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Centred so a one-line cell ("Woke up") reads level with its two-line neighbours.
  cellLabel: { textAlign: 'center' },
  hint: { marginTop: Spacing.three },
});
