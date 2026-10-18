import { StyleSheet } from 'react-native';

import { ExpandableAddRow } from '@/components/expandable-add-row';
import { ThemedText } from '@/components/themed-text';
import { presetSummary, type SunnahPreset } from '@/constants/sunnah-habits';

type Props = {
  preset: SunnahPreset;
  /** Whether a habit with this preset's name already exists. */
  added: boolean;
  onAdd: () => void;
  /** Remove the already-added habit — wires the row as a tap-to-undo. */
  onRemove: () => void;
  addHint: string;
  addedHint: string;
};

/**
 * One Sunnah preset inside a {@link SettingsSection} card. A thin wrapper over
 * {@link ExpandableAddRow}: tap the row to add (or remove) it; a trailing chevron expands to
 * reveal the "what counts as done" detail and the Sunnah evidence.
 */
export function SunnahPresetRow({ preset, added, onAdd, onRemove, addHint, addedHint }: Props) {
  // The measure and the schedule — "5 prayers · Every day" — so a counted act is seen as counted
  // before it is added.
  const summary = presetSummary(preset);

  return (
    <ExpandableAddRow
      title={preset.name}
      subtitle={summary}
      added={added}
      onAdd={onAdd}
      onRemove={onRemove}
      addHint={addHint}
      addedHint={addedHint}
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
