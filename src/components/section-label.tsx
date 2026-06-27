import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * The uppercase caption that labels a grouped-list section (the inset-grouped idiom used by
 * {@link SettingsSection} and the Progress/Settings screens). One treatment everywhere —
 * muted and hung 16px in from the card edge — so section headers don't drift
 * in weight or indent between screens. Pass an already-uppercased string.
 */
export function SectionLabel({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={[styles.label, style]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  label: { marginLeft: Spacing.three },
});
