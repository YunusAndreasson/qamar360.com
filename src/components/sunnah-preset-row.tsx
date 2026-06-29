import { StyleSheet } from 'react-native';

import { ExpandableAddRow } from '@/components/expandable-add-row';
import { ThemedText } from '@/components/themed-text';
import { scheduleSummary, type SunnahPreset } from '@/constants/sunnah-habits';

type Props = {
  preset: SunnahPreset;
  /** Whether a habit with this preset's name already exists. */
  added: boolean;
  onAdd: () => void;
  /** Remove the already-added habit — wires the ✓ as a tap-to-undo. */
  onRemove?: () => void;
};

/**
 * One Sunnah preset inside a {@link SettingsSection} card. A thin wrapper over
 * {@link ExpandableAddRow}: the row body expands to reveal the "what counts as done" detail
 * and the Sunnah evidence, with a one-tap {@link AddPill} on the right.
 */
export function SunnahPresetRow({ preset, added, onAdd, onRemove }: Props) {
  const summary = scheduleSummary(preset.defaultSchedule, preset.hijriSchedule);

  return (
    <ExpandableAddRow
      title={preset.name}
      subtitle={summary}
      added={added}
      onAdd={onAdd}
      onRemove={onRemove}
      itemLabel={preset.name}
      addLabel="Add to my habits"
      addAccessibilityLabel={`Add ${preset.name} to my habits`}
      rowAccessibilityLabel={`${preset.name}. ${summary}.`}
      expandHint="Show details">
      <ThemedText type="small">{preset.detail}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.evidence}>
        {preset.evidence}
      </ThemedText>
    </ExpandableAddRow>
  );
}

const styles = StyleSheet.create({
  evidence: { fontStyle: 'italic' },
});
