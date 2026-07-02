import { StyleSheet, View } from 'react-native';

import { ExpandableAddRow } from '@/components/expandable-add-row';
import { ThemedText } from '@/components/themed-text';
import { routinePresets, type SunnahRoutine } from '@/constants/sunnah-habits';
import { Spacing } from '@/constants/theme';

type Props = {
  routine: SunnahRoutine;
  /** Whether a stack with this routine's name already exists. */
  added: boolean;
  onAdd: () => void;
};

/**
 * One Sunnah routine inside a {@link SettingsSection}. A thin wrapper over
 * {@link ExpandableAddRow}: tap the row to add it; a trailing chevron expands to reveal the
 * habit sequence it stacks. Mirrors {@link SunnahPresetRow}.
 */
export function SunnahRoutineRow({ routine, added, onAdd }: Props) {
  const members = routinePresets(routine);

  return (
    <ExpandableAddRow
      title={routine.name}
      subtitle={`${members.length} habits`}
      added={added}
      onAdd={onAdd}
      rowAccessibilityLabel={`${routine.name}. ${members.length} habits.`}
      expandHint="Show the sequence">
      <ThemedText type="small">{routine.detail}</ThemedText>
      <View style={styles.sequence}>
        {members.map((p, i) => (
          <View key={p.id} style={styles.step}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.ordinal}>
              {i + 1}
            </ThemedText>
            <ThemedText type="small" style={styles.stepName} numberOfLines={1}>
              {p.name}
            </ThemedText>
          </View>
        ))}
      </View>
    </ExpandableAddRow>
  );
}

const styles = StyleSheet.create({
  sequence: { gap: Spacing.one, paddingVertical: Spacing.one },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  ordinal: { width: 16, textAlign: 'center' },
  stepName: { flex: 1 },
});
